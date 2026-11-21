/**
 * @fileoverview Public unauthenticated communication webhook, tracking, and unsubscribe routes.
 *
 * Mounted BEFORE the unified auth middleware at `ApiRoute('/comms')`:
 *   - `POST /comms/webhooks/sendgrid/:credentialId` (and `POST /comms/webhooks/sendgrid`)
 *   - `POST /comms/unsubscribe`
 *   - `GET  /comms/open/:token.gif`
 *   - `GET  /comms/click/:token`
 *
 * Each route authenticates its own capability (SendGrid ECDSA signature + 10-minute replay window,
 * UUIDv4 UnsubscribeToken, or HMAC-SHA256 `sig` over `TrackingToken + ':' + u`) and is protected
 * by per-IP rate limiting.
 *
 * @module @memberjunction/server/rest/CommsWebhookHandler
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import express from 'express';
import BodyParser from 'body-parser';
import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { CommunicationEngineBase } from '@memberjunction/communication-types';
import {
    ComputeTrackingSignature,
    VerifyTrackingSignature,
} from '@memberjunction/communication-engine';
import { EscapeSQLString, UUIDMap, UUIDsEqual } from '@memberjunction/global';
import {
    MJCommunicationConsentAuditLogEntity,
    MJCommunicationEndpointPrincipalEntity,
    MJCommunicationLogEntity,
    MJCommunicationPreferenceEntity,
    MJCommunicationPrincipalPreferenceEntity,
    MJCommunicationSenderEntity,
    MJCommunicationSuppressionEntity,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { CredentialEngine } from '@memberjunction/credentials';
import { VerifySendGridWebhookSignature } from '@memberjunction/communication-sendgrid';
import { WorkQueueEngine } from '@memberjunction/work-queue-engine';
import { CreateRouteRateLimiter } from './routeRateLimit.js';
import type { RouteRateLimitSettings } from '../routeRateLimitConfigUnits.js';
import {
    CommsHostSecurityHeaders,
    RenderCommsConfirmPage,
    RenderCommsErrorPage,
    RenderCommsPreferenceHostPage,
} from './CommsPreferenceHostPage.js';

export const COMMS_ACTIVITY_TOPIC = 'comms.activity';

/** Standard 43-byte 1x1 transparent GIF89a pixel. */
export const TRANSPARENT_GIF_1X1 = Buffer.from(
    'R0lGODlhAQABAPAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
    'base64',
);

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CommsActivityWorkPayload {
    [key: string]: string | number | boolean | null | Record<string, string> | undefined;
    Source: 'sendgrid-webhook' | 'unsubscribe' | 'open-pixel' | 'click-redirect';
    OccurredAt: string;
    CredentialID?: string;
    RawBody?: string;
    SignatureVerifiedAtIngress?: boolean;
    Headers?: Record<string, string>;
    EventType?: 'Opened' | 'Clicked' | 'Unsubscribed';
    TrackingToken?: string;
    UnsubscribeToken?: string;
    TargetURL?: string;
    IPAddress?: string;
    UserAgent?: string;
}

export interface PreferenceCenterTemplateContext {
    BrandName?: string;
    LogoURL?: string;
    PrimaryColor?: string;
    FooterText?: string;
    [key: string]: unknown;
}

export interface PreferenceCenterItem {
    ID: string;
    Name: string;
    Description?: string | null;
    Category?: string | null;
    MessageClass: MJCommunicationPreferenceEntity['MessageClass'];
    State: MJCommunicationPrincipalPreferenceEntity['State'];
}

export interface PreferenceCenterData {
    Token: string;
    Sender: {
        ID: string;
        Name: string;
        TemplateContext: PreferenceCenterTemplateContext;
    };
    Preferences: PreferenceCenterItem[];
    CanUnsubscribeAll: boolean;
}

export interface SavePreferenceChoicesInput {
    Token: string;
    UnsubscribeAll: boolean;
    Preferences?: Array<{
        PreferenceID: string;
        State: 'Opted In' | 'Opted Out';
    }>;
    IPAddress?: string;
    UserAgent?: string;
}

export interface SavePreferenceChoicesResult {
    Found: boolean;
    Success: boolean;
    UnsubscribedAll: boolean;
    Preferences: PreferenceCenterItem[];
    ErrorMessage?: string;
}

export interface ConfirmOptInInput {
    Token: string;
    IPAddress?: string;
    UserAgent?: string;
}

export interface ConfirmOptInResult {
    Found: boolean;
    Confirmed: boolean;
    AlreadyConfirmed?: boolean;
    State?: MJCommunicationPrincipalPreferenceEntity['State'];
    ConfirmedAt?: string;
    ErrorMessage?: string;
}

export interface CommsWebhookHandlerOptions {
    /** Override for loading the SendGrid ECDSA verification public key for a credential ID. */
    ResolveWebhookKey?: (credentialId?: string) => Promise<string | undefined>;
    /** Override for publishing onto the `comms.activity` WorkQueue topic. */
    PublishActivity?: (payload: CommsActivityWorkPayload) => Promise<void>;
    /** HMAC secret used to verify `/click/:token?u=...&sig=...` redirects. */
    HmacSecret?: string | (() => string | undefined);
    /** Per-IP rate limit overrides for `/comms/*` routes (fallback when route-specific limit is omitted). */
    RateLimit?: Partial<RouteRateLimitSettings>;
    /** Per-IP rate limit overrides for `/comms/webhooks/*` routes. */
    WebhookRateLimit?: Partial<RouteRateLimitSettings>;
    /** Per-IP rate limit overrides for `/comms/open/*` and `/comms/click/*` tracking routes. */
    TrackingRateLimit?: Partial<RouteRateLimitSettings>;
    /** Per-IP rate limit overrides for `/comms/unsubscribe*`, `/preferences*`, `/confirm*`. */
    UnsubscribeRateLimit?: Partial<RouteRateLimitSettings>;
    /** Override for verifying whether a TrackingToken or UnsubscribeToken exists before enqueueing activity. */
    VerifyToken?: (kind: 'tracking' | 'unsubscribe', token: string) => Promise<boolean>;
    /** Clock override (Unix seconds) for deterministic replay-window testing. */
    NowSeconds?: () => number;
    /** Override for loading preference center data by UnsubscribeToken. */
    ResolvePreferenceCenterData?: (token: string) => Promise<PreferenceCenterData | null>;
    /** Override for saving preference center choices by UnsubscribeToken. */
    SavePreferenceCenterChoices?: (input: SavePreferenceChoicesInput) => Promise<SavePreferenceChoicesResult>;
    /** Override for confirming double opt-in by ConfirmationToken. */
    ConfirmDoubleOptIn?: (input: ConfirmOptInInput) => Promise<ConfirmOptInResult>;
    /** Override for resolving `CommunicationSender.PreferenceCenterURL` for GET /unsubscribe. */
    ResolveUnsubscribeRedirect?: (token: string) => Promise<string | undefined>;
    /** Optional URL of the `<mj-comms-preference-center>` Angular Element bundle. */
    PreferenceElementSrc?: string;
    /** Optional CSP nonce generator override for deterministic testing. */
    GenerateNonce?: () => string;
}

/**
 * Builds the Express router for public `/comms/*` webhook, tracking, and unsubscribe routes.
 */
export function CreateCommsWebhookHandler(options: CommsWebhookHandlerOptions = {}): express.Router {
    const router = express.Router();
    const resolveKey = options.ResolveWebhookKey ?? defaultResolveWebhookKey;
    const publishActivity = options.PublishActivity ?? defaultPublishActivity;
    const getHmacSecret = resolveSecretAccessor(options.HmacSecret);
    const nowSeconds = options.NowSeconds ?? (() => Math.floor(Date.now() / 1000));
    const resolvePrefData = options.ResolvePreferenceCenterData ?? defaultResolvePreferenceCenterData;
    const savePrefChoices = options.SavePreferenceCenterChoices ?? defaultSavePreferenceCenterChoices;
    const confirmOptIn = options.ConfirmDoubleOptIn ?? defaultConfirmDoubleOptIn;
    const resolveUnsubRedirect = options.ResolveUnsubscribeRedirect ?? defaultResolveUnsubscribeRedirect;
    const elementSrc = options.PreferenceElementSrc ?? process.env.MJ_COMMS_PREFERENCE_ELEMENT_SRC;
    const generateNonce = options.GenerateNonce ?? (() => crypto.randomBytes(16).toString('base64'));
    const verifyToken = options.VerifyToken ?? (options.PublishActivity ? async () => true : defaultVerifyToken);

    const webhookLimiter = CreateRouteRateLimiter(
        'commsWebhooks',
        options.WebhookRateLimit ?? options.RateLimit,
    );
    const trackingLimiter = CreateRouteRateLimiter(
        'commsTracking',
        options.TrackingRateLimit ?? options.RateLimit,
    );
    const unsubscribeLimiter = CreateRouteRateLimiter(
        'commsUnsubscribe',
        options.UnsubscribeRateLimit ?? options.RateLimit,
    );

    const rawBodyParser = BodyParser.raw({ type: '*/*', limit: '10mb' });
    router.post('/webhooks/sendgrid/:credentialId', webhookLimiter, rawBodyParser, async (req, res) => {
        await handleSendGridWebhook(req, res, resolveKey, publishActivity, nowSeconds);
    });
    router.post('/webhooks/sendgrid', webhookLimiter, rawBodyParser, async (req, res) => {
        await handleSendGridWebhook(req, res, resolveKey, publishActivity, nowSeconds);
    });

    router.get('/unsubscribe', unsubscribeLimiter, async (req, res) => {
        await handleUnsubscribeRedirect(req, res, resolveUnsubRedirect);
    });
    router.get('/unsubscribe/:token', unsubscribeLimiter, async (req, res) => {
        await handleUnsubscribeRedirect(req, res, resolveUnsubRedirect);
    });

    router.post(
        '/unsubscribe',
        unsubscribeLimiter,
        BodyParser.json({ limit: '64kb' }),
        BodyParser.urlencoded({ extended: false, limit: '64kb' }),
        async (req, res) => {
            await handleUnsubscribe(req, res, publishActivity, verifyToken);
        },
    );
    router.post(
        '/unsubscribe/:token',
        unsubscribeLimiter,
        BodyParser.json({ limit: '64kb' }),
        BodyParser.urlencoded({ extended: false, limit: '64kb' }),
        async (req, res) => {
            await handleUnsubscribe(req, res, publishActivity, verifyToken);
        },
    );

    router.get('/preferences-element.js', (_req, res) => {
        const bundlePath = resolvePreferenceElementBundlePath();
        if (!bundlePath) {
            res.status(404).type('text/plain').send('Preference center element bundle not built');
            return;
        }
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.type('application/javascript; charset=utf-8');
        res.sendFile(bundlePath);
    });

    router.get('/preferences/:token', unsubscribeLimiter, async (req, res) => {
        await handleGetPreferences(req, res, resolvePrefData, generateNonce, elementSrc);
    });

    router.post(
        '/preferences/:token',
        unsubscribeLimiter,
        BodyParser.json({ limit: '64kb' }),
        async (req, res) => {
            await handlePostPreferences(req, res, savePrefChoices);
        },
    );

    router.get('/confirm/:token', unsubscribeLimiter, (req, res) => {
        handleGetConfirm(req, res, generateNonce);
    });

    router.post(
        '/confirm/:token',
        unsubscribeLimiter,
        BodyParser.json({ limit: '16kb' }),
        BodyParser.urlencoded({ extended: false, limit: '16kb' }),
        async (req, res) => {
            await handlePostConfirm(req, res, confirmOptIn, generateNonce);
        },
    );

    router.get('/open/:token.gif', trackingLimiter, async (req, res) => {
        await handleOpenPixel(req, res, publishActivity, verifyToken);
    });

    router.get('/click/:token', trackingLimiter, async (req, res) => {
        await handleClickRedirect(req, res, publishActivity, getHmacSecret, verifyToken);
    });

    return router;
}

async function handleSendGridWebhook(
    req: express.Request,
    res: express.Response,
    resolveKey: (credentialId?: string) => Promise<string | undefined>,
    publishActivity: (payload: CommsActivityWorkPayload) => Promise<void>,
    nowSeconds: () => number,
): Promise<void> {
    const rawCredId = req.params.credentialId;
    const credentialId = Array.isArray(rawCredId) ? rawCredId[0] : rawCredId;

    const rawBodyBuf = extractRawBodyBuffer(req);
    if (!rawBodyBuf || rawBodyBuf.length === 0) {
        res.status(400).json({ error: 'Empty webhook body' });
        return;
    }

    const verificationKey = await resolveKey(credentialId);
    if (!verificationKey) {
        res.status(401).json({ error: 'Webhook verification key not configured' });
        return;
    }

    const signature = getHeaderString(req, 'x-twilio-email-event-webhook-signature');
    const timestamp = getHeaderString(req, 'x-twilio-email-event-webhook-timestamp');
    if (!signature || !timestamp) {
        res.status(401).json({ error: 'Missing SendGrid signature or timestamp header' });
        return;
    }

    const verification = VerifySendGridWebhookSignature(verificationKey, rawBodyBuf, signature, timestamp, nowSeconds());
    if (!verification.Valid) {
        res.status(401).json({ error: verification.Reason ?? 'Invalid webhook signature' });
        return;
    }

    const rawBodyText = rawBodyBuf.toString('utf8');
    let parsedArray: unknown;
    try {
        parsedArray = JSON.parse(rawBodyText);
    } catch {
        parsedArray = null;
    }
    if (!Array.isArray(parsedArray)) {
        res.status(400).json({ error: 'Expected JSON array payload' });
        return;
    }

    const MAX_QUEUE_PAYLOAD_BYTES = 180_000;
    try {
        const occurredAt = new Date(nowSeconds() * 1000).toISOString();
        const headers = normalizeHeaders(req.headers);
        if (Buffer.byteLength(rawBodyText, 'utf8') <= MAX_QUEUE_PAYLOAD_BYTES) {
            await publishActivity({
                Source: 'sendgrid-webhook',
                OccurredAt: occurredAt,
                ...(credentialId ? { CredentialID: credentialId } : {}),
                RawBody: rawBodyText,
                Headers: headers,
            });
        } else {
            const chunks = chunkWebhookArrayByBytes(parsedArray, MAX_QUEUE_PAYLOAD_BYTES);
            for (const chunkJson of chunks) {
                await publishActivity({
                    Source: 'sendgrid-webhook',
                    OccurredAt: occurredAt,
                    ...(credentialId ? { CredentialID: credentialId } : {}),
                    RawBody: chunkJson,
                    SignatureVerifiedAtIngress: true,
                    Headers: headers,
                });
            }
        }
        res.status(202).json({ accepted: true });
    } catch (ex) {
        LogError(`[CommsWebhook] Failed to enqueue SendGrid webhook batch: ${ex instanceof Error ? ex.message : String(ex)}`);
        res.status(503).json({ error: 'Failed to enqueue webhook batch' });
    }
}

function chunkWebhookArrayByBytes(events: unknown[], maxBytes: number): string[] {
    const chunks: string[] = [];
    let current: unknown[] = [];
    let currentBytes = 2; // '[]'

    for (const ev of events) {
        const serialized = JSON.stringify(ev);
        const itemBytes = Buffer.byteLength(serialized, 'utf8') + (current.length > 0 ? 1 : 0);
        if (current.length > 0 && currentBytes + itemBytes > maxBytes) {
            chunks.push(JSON.stringify(current));
            current = [ev];
            currentBytes = 2 + Buffer.byteLength(serialized, 'utf8');
        } else {
            current.push(ev);
            currentBytes += itemBytes;
        }
    }
    if (current.length > 0) {
        chunks.push(JSON.stringify(current));
    }
    return chunks;
}

async function handleUnsubscribe(
    req: express.Request,
    res: express.Response,
    publishActivity: (payload: CommsActivityWorkPayload) => Promise<void>,
    verifyToken: (kind: 'tracking' | 'unsubscribe', token: string) => Promise<boolean>,
): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const token = extractUnsubscribeToken(req);
    if (!token || !UUID_V4_REGEX.test(token)) {
        res.status(400).json({ error: 'Invalid or missing UnsubscribeToken' });
        return;
    }

    try {
        if (!(await verifyToken('unsubscribe', token))) {
            res.status(404).json({ error: 'Unknown unsubscribe token' });
            return;
        }
        await publishActivity({
            Source: 'unsubscribe',
            EventType: 'Unsubscribed',
            UnsubscribeToken: token,
            OccurredAt: new Date().toISOString(),
            IPAddress: req.ip,
            UserAgent: req.get('user-agent'),
        });
        res.status(200).json({ unsubscribed: true });
    } catch (ex) {
        LogError(`[CommsWebhook] Failed to persist unsubscribe: ${ex instanceof Error ? ex.message : String(ex)}`);
        res.status(503).json({ error: 'Failed to process unsubscribe' });
    }
}

async function handleOpenPixel(
    req: express.Request,
    res: express.Response,
    publishActivity: (payload: CommsActivityWorkPayload) => Promise<void>,
    verifyToken: (kind: 'tracking' | 'unsubscribe', token: string) => Promise<boolean>,
): Promise<void> {
    const rawToken = req.params.token;
    const token = (Array.isArray(rawToken) ? rawToken[0] : rawToken)?.trim();

    if (token && UUID_V4_REGEX.test(token)) {
        try {
            if (await verifyToken('tracking', token)) {
                await publishActivity({
                    Source: 'open-pixel',
                    EventType: 'Opened',
                    TrackingToken: token,
                    OccurredAt: new Date().toISOString(),
                    IPAddress: req.ip,
                    UserAgent: req.get('user-agent'),
                });
            }
        } catch (ex) {
            LogError(`[CommsWebhook] Failed to enqueue open event: ${ex instanceof Error ? ex.message : String(ex)}`);
        }
    }

    res.status(200);
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Content-Length', String(TRANSPARENT_GIF_1X1.length));
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.end(TRANSPARENT_GIF_1X1);
}

async function handleClickRedirect(
    req: express.Request,
    res: express.Response,
    publishActivity: (payload: CommsActivityWorkPayload) => Promise<void>,
    getHmacSecret: () => string | undefined,
    verifyToken: (kind: 'tracking' | 'unsubscribe', token: string) => Promise<boolean>,
): Promise<void> {
    const rawToken = req.params.token;
    const token = (Array.isArray(rawToken) ? rawToken[0] : rawToken)?.trim();
    const targetUrl = typeof req.query.u === 'string' ? req.query.u : undefined;
    const sig = typeof req.query.sig === 'string' ? req.query.sig : undefined;

    if (!token || !targetUrl || !sig || !isSafeHttpUrl(targetUrl)) {
        res.status(400).json({ error: 'Missing or invalid click tracking parameters' });
        return;
    }

    const secret = getHmacSecret();
    if (!secret || !verifyClickHmac(secret, token, targetUrl, sig)) {
        res.status(400).json({ error: 'Invalid or tampered click signature' });
        return;
    }

    try {
        if (UUID_V4_REGEX.test(token) && (await verifyToken('tracking', token))) {
            await publishActivity({
                Source: 'click-redirect',
                EventType: 'Clicked',
                TrackingToken: token,
                TargetURL: targetUrl,
                OccurredAt: new Date().toISOString(),
                IPAddress: req.ip,
                UserAgent: req.get('user-agent'),
            });
        }
    } catch (ex) {
        LogError(`[CommsWebhook] Failed to enqueue click event: ${ex instanceof Error ? ex.message : String(ex)}`);
    }

    res.redirect(302, targetUrl);
}

/** Computes the HMAC-SHA256 signature over `trackingToken + ':' + targetUrl`. */
export function SignClickTrackingUrl(secret: string, trackingToken: string, targetUrl: string): string {
    return ComputeTrackingSignature(trackingToken, targetUrl, secret);
}

function verifyClickHmac(secret: string, trackingToken: string, targetUrl: string, providedSig: string): boolean {
    return VerifyTrackingSignature(trackingToken, targetUrl, providedSig, secret);
}

function isSafeHttpUrl(rawUrl: string): boolean {
    try {
        const parsed = new URL(rawUrl);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function extractRawBodyBuffer(req: express.Request): Buffer | undefined {
    if (Buffer.isBuffer(req.body)) {
        return req.body;
    }
    const augmented = (req as { rawBody?: Buffer }).rawBody;
    if (Buffer.isBuffer(augmented)) {
        return augmented;
    }
    if (typeof req.body === 'string') {
        return Buffer.from(req.body, 'utf8');
    }
    return undefined;
}

function isJsonArrayPayload(rawBody: string): boolean {
    try {
        return Array.isArray(JSON.parse(rawBody));
    } catch {
        return false;
    }
}

function extractUnsubscribeToken(req: express.Request): string | undefined {
    const routeToken = extractRouteToken(req);
    if (routeToken) {
        return routeToken;
    }
    if (typeof req.query.token === 'string' && req.query.token.trim().length > 0) {
        return req.query.token.trim();
    }
    const body = req.body as Record<string, unknown> | undefined;
    if (body && typeof body === 'object') {
        const candidate = body['UnsubscribeToken'] ?? body['token'];
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim();
        }
    }
    return undefined;
}

function getHeaderString(req: express.Request, name: string): string | undefined {
    const val = req.headers[name.toLowerCase()];
    if (typeof val === 'string') return val;
    if (Array.isArray(val) && val.length > 0) return val[0];
    return undefined;
}

function normalizeHeaders(headers: express.Request['headers']): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        if (typeof value === 'string') {
            out[key] = value;
        } else if (Array.isArray(value)) {
            out[key] = value.join(', ');
        }
    }
    return out;
}

function resolveSecretAccessor(hmacSecret?: string | (() => string | undefined)): () => string | undefined {
    if (typeof hmacSecret === 'function') {
        return hmacSecret;
    }
    if (typeof hmacSecret === 'string') {
        return () => hmacSecret;
    }
    return () => process.env.MJ_COMMS_HMAC_SECRET;
}

export async function ResolveSendGridWebhookVerificationKey(credentialId?: string): Promise<string | undefined> {
    return defaultResolveWebhookKey(credentialId);
}

async function defaultResolveWebhookKey(credentialId?: string): Promise<string | undefined> {
    if (credentialId) {
        const systemUser = getSystemUser();
        if (!systemUser) {
            return undefined;
        }
        await CredentialEngine.Instance.Config(false, systemUser);
        const cred = CredentialEngine.Instance.getCredentialById(credentialId);
        if (!cred) {
            return undefined;
        }
        const typeOrName = `${cred.CredentialType ?? ''} ${cred.Name ?? ''}`.toLowerCase();
        if (!typeOrName.includes('sendgrid')) {
            return undefined;
        }
        const resolved = await CredentialEngine.Instance.GetCredential<{
            webhookVerificationKey?: string;
            verificationKey?: string;
            publicKey?: string;
        }>(cred.Name, { contextUser: systemUser, subsystem: 'CommsWebhook' });
        return resolved.values.webhookVerificationKey ?? resolved.values.verificationKey ?? resolved.values.publicKey;
    }
    return process.env.COMMUNICATION_VENDOR_WEBHOOK_KEY__SENDGRID;
}

async function defaultPublishActivity(payload: CommsActivityWorkPayload): Promise<void> {
    if (WorkQueueEngine.Instance.Topics.length === 0) {
        const systemUser = getSystemUser();
        if (systemUser) {
            await WorkQueueEngine.Instance.Config(false, systemUser);
        }
    }
    const results = await WorkQueueEngine.Instance.Publish(COMMS_ACTIVITY_TOPIC, [{ Payload: payload }]);
    const rejected = results.find((r) => r.Status === 'Rejected');
    if (rejected) {
        throw new Error(`WorkQueue publish rejected (${rejected.Error?.Code ?? 'Unknown'}): ${rejected.Error?.Message ?? ''}`);
    }
}

function getSystemUser(): UserInfo | null {
    try {
        return UserCache.Instance.GetSystemUser() ?? null;
    } catch {
        return null;
    }
}

function extractRouteToken(req: express.Request): string | undefined {
    const raw = req.params.token;
    const token = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    return token && UUID_V4_REGEX.test(token) ? token : undefined;
}

function prefersJson(req: express.Request): boolean {
    const accept = (req.get('accept') ?? '').toLowerCase();
    if (!accept) return false;
    if (accept.includes('application/json') && !accept.includes('text/html')) {
        return true;
    }
    return req.accepts(['html', 'json']) === 'json';
}

function setSecurityHeaders(res: express.Response, nonce: string): void {
    const headers = CommsHostSecurityHeaders(nonce);
    for (const [k, v] of Object.entries(headers)) {
        res.setHeader(k, v);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
}

async function handleUnsubscribeRedirect(
    req: express.Request,
    res: express.Response,
    resolveRedirect: (token: string) => Promise<string | undefined>,
): Promise<void> {
    const token =
        extractRouteToken(req) ??
        (typeof req.query.token === 'string' ? req.query.token.trim() : undefined);
    if (!token || !UUID_V4_REGEX.test(token)) {
        res.status(400).json({ error: 'Invalid or missing UnsubscribeToken' });
        return;
    }

    try {
        const customUrl = await resolveRedirect(token);
        if (customUrl && isSafeHttpUrl(customUrl)) {
            const sep = customUrl.includes('?') ? '&' : '?';
            res.redirect(302, `${customUrl}${sep}token=${encodeURIComponent(token)}`);
            return;
        }
    } catch (ex) {
        LogError(`[CommsWebhook] Failed to resolve PreferenceCenterURL: ${ex instanceof Error ? ex.message : String(ex)}`);
    }

    const base = (req.baseUrl || '/comms').replace(/\/+$/, '');
    res.redirect(302, `${base}/preferences/${encodeURIComponent(token)}`);
}

async function handleGetPreferences(
    req: express.Request,
    res: express.Response,
    resolvePrefData: (token: string) => Promise<PreferenceCenterData | null>,
    generateNonce: () => string,
    elementSrc?: string,
): Promise<void> {
    const token = extractRouteToken(req);
    if (!token) {
        if (prefersJson(req)) {
            res.status(400).json({ error: 'Invalid preference token' });
        } else {
            const nonce = generateNonce();
            setSecurityHeaders(res, nonce);
            res.status(400).send(RenderCommsErrorPage({ Message: 'Invalid or missing preference link.', CspNonce: nonce }));
        }
        return;
    }

    if (prefersJson(req)) {
        try {
            const data = await resolvePrefData(token);
            if (!data) {
                res.status(404).json({ error: 'Preference token not found' });
                return;
            }
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).json(data);
        } catch (ex) {
            LogError(`[CommsWebhook] Failed to load preference center data: ${ex instanceof Error ? ex.message : String(ex)}`);
            res.status(500).json({ error: 'Failed to load preferences' });
        }
        return;
    }

    const nonce = generateNonce();
    setSecurityHeaders(res, nonce);
    const apiRoot = (req.baseUrl || '/comms').replace(/\/+$/, '');
    const resolvedElementSrc = elementSrc ?? (resolvePreferenceElementBundlePath() ? `${apiRoot}/preferences-element.js` : undefined);
    res.status(200).send(
        RenderCommsPreferenceHostPage({
            Token: token,
            ApiRoot: apiRoot,
            CspNonce: nonce,
            ElementSrc: resolvedElementSrc,
        }),
    );
}

async function handlePostPreferences(
    req: express.Request,
    res: express.Response,
    savePrefChoices: (input: SavePreferenceChoicesInput) => Promise<SavePreferenceChoicesResult>,
): Promise<void> {
    const token = extractRouteToken(req);
    if (!token) {
        res.status(400).json({ error: 'Invalid preference token' });
        return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const unsubscribeAll = body.UnsubscribeAll === true;
    const rawPrefs = Array.isArray(body.Preferences) ? body.Preferences : undefined;
    const prefs = rawPrefs
        ?.filter(
            (p): p is { PreferenceID: string; State: 'Opted In' | 'Opted Out' } =>
                Boolean(p) &&
                typeof p === 'object' &&
                typeof (p as Record<string, unknown>).PreferenceID === 'string' &&
                ((p as Record<string, unknown>).State === 'Opted In' ||
                    (p as Record<string, unknown>).State === 'Opted Out'),
        );

    if (!unsubscribeAll && (!prefs || prefs.length === 0)) {
        res.status(400).json({ error: 'Provide Preferences array or UnsubscribeAll: true' });
        return;
    }

    try {
        const result = await savePrefChoices({
            Token: token,
            UnsubscribeAll: unsubscribeAll,
            Preferences: prefs,
            IPAddress: req.ip,
            UserAgent: req.get('user-agent'),
        });
        if (!result.Found) {
            res.status(404).json({ error: 'Preference token not found' });
            return;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.status(result.Success ? 200 : 400).json(result);
    } catch (ex) {
        LogError(`[CommsWebhook] Failed to save preference choices: ${ex instanceof Error ? ex.message : String(ex)}`);
        res.status(500).json({ error: 'Failed to save preferences' });
    }
}

function handleGetConfirm(
    req: express.Request,
    res: express.Response,
    generateNonce: () => string,
): void {
    const token = extractRouteToken(req);
    const nonce = generateNonce();
    setSecurityHeaders(res, nonce);

    if (!token) {
        res.status(400).send(RenderCommsErrorPage({
            Message: 'Invalid or missing confirmation link.',
            PageTitle: 'Confirmation Unavailable',
            CspNonce: nonce,
        }));
        return;
    }

    const apiRoot = (req.baseUrl || '/comms').replace(/\/+$/, '');
    res.status(200).send(RenderCommsConfirmPage({
        Token: token,
        ApiRoot: apiRoot,
        CspNonce: nonce,
    }));
}

async function handlePostConfirm(
    req: express.Request,
    res: express.Response,
    confirmOptIn: (input: ConfirmOptInInput) => Promise<ConfirmOptInResult>,
    generateNonce: () => string,
): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const token = extractRouteToken(req);
    if (!token) {
        if (prefersJson(req)) {
            res.status(400).json({ error: 'Invalid confirmation token' });
        } else {
            const nonce = generateNonce();
            setSecurityHeaders(res, nonce);
            res.status(400).send(RenderCommsErrorPage({ Message: 'Invalid confirmation token.', CspNonce: nonce }));
        }
        return;
    }

    try {
        const result = await confirmOptIn({
            Token: token,
            IPAddress: req.ip,
            UserAgent: req.get('user-agent'),
        });
        if (!result.Found) {
            if (prefersJson(req)) {
                res.status(404).json({ error: 'Confirmation token not found' });
            } else {
                const nonce = generateNonce();
                setSecurityHeaders(res, nonce);
                res.status(404).send(RenderCommsErrorPage({ Message: 'Confirmation link not found or expired.', CspNonce: nonce }));
            }
            return;
        }
        if (!result.Confirmed) {
            if (prefersJson(req)) {
                res.status(409).json(result);
            } else {
                const nonce = generateNonce();
                setSecurityHeaders(res, nonce);
                res.status(409).send(RenderCommsErrorPage({
                    Message: 'This subscription cannot be confirmed because it has been opted out.',
                    PageTitle: 'Confirmation Unavailable',
                    CspNonce: nonce,
                }));
            }
            return;
        }
        if (prefersJson(req)) {
            res.status(200).json(result);
            return;
        }
        const nonce = generateNonce();
        setSecurityHeaders(res, nonce);
        res.status(200).send(RenderCommsConfirmPage({
            Token: token,
            ApiRoot: (req.baseUrl || '/comms').replace(/\/+$/, ''),
            CspNonce: nonce,
            Confirmed: result.Confirmed,
        }));
    } catch (ex) {
        LogError(`[CommsWebhook] Failed to confirm opt-in: ${ex instanceof Error ? ex.message : String(ex)}`);
        res.status(500).json({ error: 'Failed to confirm subscription' });
    }
}

function getCommsProvider(provider?: IMetadataProvider): IMetadataProvider {
    return provider ?? CommunicationEngineBase.Instance.ProviderToUse;
}

async function loadLogAndSenderByToken(
    token: string,
    systemUser: UserInfo,
    provider?: IMetadataProvider,
): Promise<{ log: MJCommunicationLogEntity; sender: MJCommunicationSenderEntity | null } | null> {
    const md = getCommsProvider(provider);
    const rv = RunView.FromMetadataProvider(md);
    const logRes = await rv.RunView<MJCommunicationLogEntity>(
        {
            EntityName: 'MJ: Communication Logs',
            ExtraFilter: `UnsubscribeToken='${EscapeSQLString(token)}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
        },
        systemUser,
    );
    if (!logRes.Success || logRes.Results.length === 0) {
        return null;
    }
    const log = logRes.Results[0];
    let sender: MJCommunicationSenderEntity | null = null;
    if (log.CommunicationSenderID) {
        const s = await md.GetEntityObject<MJCommunicationSenderEntity>('MJ: Communication Senders', systemUser);
        if (await s.Load(log.CommunicationSenderID)) {
            sender = s;
        }
    }
    return { log, sender };
}

async function resolvePrincipalFromLog(
    log: MJCommunicationLogEntity,
    systemUser: UserInfo,
    provider?: IMetadataProvider,
): Promise<{ EntityID: string; RecordID: string } | null> {
    if (log.EntityID && log.RecordID) {
        return { EntityID: log.EntityID, RecordID: log.RecordID };
    }
    if (!log.CommunicationEndpointID) return null;
    const rv = RunView.FromMetadataProvider(getCommsProvider(provider));
    const res = await rv.RunView<MJCommunicationEndpointPrincipalEntity>(
        {
            EntityName: 'MJ: Communication Endpoint Principals',
            ExtraFilter: `CommunicationEndpointID='${EscapeSQLString(log.CommunicationEndpointID)}'`,
            MaxRows: 2,
            ResultType: 'entity_object',
        },
        systemUser,
    );
    // Only attribute principal-level consent when the endpoint maps unambiguously to a single principal.
    if (!res.Success || res.Results.length !== 1) return null;
    return { EntityID: res.Results[0].EntityID, RecordID: res.Results[0].RecordID };
}

function parseTemplateContext(raw: string | null | undefined): PreferenceCenterTemplateContext {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const src = parsed as Record<string, unknown>;
        const safe: PreferenceCenterTemplateContext = {};
        if (typeof src.BrandName === 'string') safe.BrandName = src.BrandName;
        if (typeof src.CompanyName === 'string') safe.CompanyName = src.CompanyName;
        if (typeof src.LogoURL === 'string') safe.LogoURL = src.LogoURL;
        if (typeof src.PrimaryColor === 'string') safe.PrimaryColor = src.PrimaryColor;
        if (typeof src.FooterText === 'string') safe.FooterText = src.FooterText;
        if (typeof src.SupportEmail === 'string') safe.SupportEmail = src.SupportEmail;
        if (typeof src.PrivacyPolicyURL === 'string') safe.PrivacyPolicyURL = src.PrivacyPolicyURL;
        return safe;
    } catch {
        return {};
    }
}

async function defaultVerifyToken(kind: 'tracking' | 'unsubscribe', token: string): Promise<boolean> {
    const systemUser = getSystemUser();
    if (!systemUser) return false;
    const field = kind === 'tracking' ? 'TrackingToken' : 'UnsubscribeToken';
    const rv = RunView.FromMetadataProvider(getCommsProvider());
    const res = await rv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ: Communication Logs',
            Fields: ['ID'],
            ExtraFilter: `${field}='${EscapeSQLString(token)}'`,
            MaxRows: 1,
            ResultType: 'simple',
        },
        systemUser,
    );
    return res.Success && res.Results.length > 0;
}

async function defaultResolveUnsubscribeRedirect(token: string, provider?: IMetadataProvider): Promise<string | undefined> {
    const systemUser = getSystemUser();
    if (!systemUser) return undefined;
    const found = await loadLogAndSenderByToken(token, systemUser, provider);
    return found?.sender?.PreferenceCenterURL ?? undefined;
}

async function defaultResolvePreferenceCenterData(token: string, provider?: IMetadataProvider): Promise<PreferenceCenterData | null> {
    const systemUser = getSystemUser();
    if (!systemUser) return null;

    const md = getCommsProvider(provider);
    const found = await loadLogAndSenderByToken(token, systemUser, md);
    if (!found) return null;

    const { log, sender } = found;
    const senderFilter = sender
        ? `(CommunicationSenderID='${EscapeSQLString(sender.ID)}' OR CommunicationSenderID IS NULL)`
        : 'CommunicationSenderID IS NULL';

    const rv = RunView.FromMetadataProvider(md);
    const prefRes = await rv.RunView<MJCommunicationPreferenceEntity>(
        {
            EntityName: 'MJ: Communication Preferences',
            ExtraFilter: `Status='Active' AND IsUserVisible=1 AND ${senderFilter}`,
            OrderBy: 'DisplayOrder ASC, Name ASC',
            ResultType: 'entity_object',
        },
        systemUser,
    );
    const prefs = prefRes.Success ? prefRes.Results : [];
    const principal = await resolvePrincipalFromLog(log, systemUser, md);

    let principalPrefs: MJCommunicationPrincipalPreferenceEntity[] = [];
    if (principal) {
        const ppRes = await rv.RunView<MJCommunicationPrincipalPreferenceEntity>(
            {
                EntityName: 'MJ: Communication Principal Preferences',
                ExtraFilter: `EntityID='${EscapeSQLString(principal.EntityID)}' AND RecordID='${EscapeSQLString(principal.RecordID)}'`,
                ResultType: 'entity_object',
            },
            systemUser,
        );
        principalPrefs = ppRes.Success ? ppRes.Results : [];
    }

    const prefMatchById = new UUIDMap<MJCommunicationPrincipalPreferenceEntity>();
    for (const pp of principalPrefs) {
        const matchesSender = Boolean(pp.CommunicationSenderID && sender && UUIDsEqual(pp.CommunicationSenderID, sender.ID));
        if (!pp.CommunicationSenderID || matchesSender) {
            const existing = prefMatchById.Get(pp.CommunicationPreferenceID);
            if (!existing || matchesSender) {
                prefMatchById.Set(pp.CommunicationPreferenceID, pp);
            }
        }
    }

    const suppClauses: string[] = [];
    if (log.CommunicationEndpointID) {
        suppClauses.push(`CommunicationEndpointID='${EscapeSQLString(log.CommunicationEndpointID)}'`);
    }
    if (principal) {
        suppClauses.push(`(EntityID='${EscapeSQLString(principal.EntityID)}' AND RecordID='${EscapeSQLString(principal.RecordID)}')`);
    }
    let hasGlobalUnsubscribe = false;
    let latestUnsubscribeMs = 0;
    if (suppClauses.length > 0) {
        const suppRes = await rv.RunView<MJCommunicationSuppressionEntity>(
            {
                EntityName: 'MJ: Communication Suppressions',
                ExtraFilter: `Status='Active' AND Reason='User Unsubscribe' AND CommunicationPreferenceID IS NULL AND (${suppClauses.join(' OR ')})`,
                ResultType: 'entity_object',
            },
            systemUser,
        );
        if (suppRes.Success) {
            for (const s of suppRes.Results) {
                if (!s.CommunicationSenderID || (sender && UUIDsEqual(s.CommunicationSenderID, sender.ID))) {
                    hasGlobalUnsubscribe = true;
                    const effMs = s.EffectiveAt ? s.EffectiveAt.getTime() : 0;
                    if (effMs > latestUnsubscribeMs) latestUnsubscribeMs = effMs;
                }
            }
        }
    }

    const items: PreferenceCenterItem[] = prefs.map((pref) => {
        const match = prefMatchById.Get(pref.ID);
        let state: MJCommunicationPrincipalPreferenceEntity['State'] = match ? match.State : pref.DefaultState;
        if (hasGlobalUnsubscribe) {
            const optedInAfterUnsub =
                match?.State === 'Opted In' &&
                match.ConsentAt &&
                match.ConsentAt.getTime() > latestUnsubscribeMs;
            if (!optedInAfterUnsub) {
                state = 'Opted Out';
            }
        }
        return {
            ID: pref.ID,
            Name: pref.Name,
            Description: pref.Description,
            Category: pref.Category,
            MessageClass: pref.MessageClass,
            State: state,
        };
    });

    return {
        Token: token,
        Sender: {
            ID: sender?.ID ?? '',
            Name: sender?.Name ?? 'Communications',
            TemplateContext: parseTemplateContext(sender?.TemplateContext),
        },
        Preferences: items,
        CanUnsubscribeAll: true,
    };
}

async function upsertPrincipalPreferenceAndAudit(
    params: {
        EntityID: string;
        RecordID: string;
        PreferenceID: string;
        SenderID: string | null;
        State: 'Opted In' | 'Opted Out';
        LogID: string;
        IPAddress?: string;
        UserAgent?: string;
    },
    systemUser: UserInfo,
    provider?: IMetadataProvider,
): Promise<void> {
    const md = getCommsProvider(provider);
    const rv = RunView.FromMetadataProvider(md);
    const senderClause = params.SenderID
        ? `CommunicationSenderID='${EscapeSQLString(params.SenderID)}'`
        : 'CommunicationSenderID IS NULL';
    const existingRes = await rv.RunView<MJCommunicationPrincipalPreferenceEntity>(
        {
            EntityName: 'MJ: Communication Principal Preferences',
            ExtraFilter: `EntityID='${EscapeSQLString(params.EntityID)}' AND RecordID='${EscapeSQLString(params.RecordID)}' AND CommunicationPreferenceID='${EscapeSQLString(params.PreferenceID)}' AND ${senderClause}`,
            MaxRows: 1,
            ResultType: 'entity_object',
        },
        systemUser,
    );

    const existing = existingRes.Success && existingRes.Results.length > 0 ? existingRes.Results[0] : null;
    const prevValue = existing ? JSON.stringify({ State: existing.State }) : null;
    const pp = existing ?? (await md.GetEntityObject<MJCommunicationPrincipalPreferenceEntity>('MJ: Communication Principal Preferences', systemUser));

    if (!existing) {
        pp.EntityID = params.EntityID;
        pp.RecordID = params.RecordID;
        pp.CommunicationPreferenceID = params.PreferenceID;
        pp.CommunicationSenderID = params.SenderID;
    }
    pp.State = params.State;
    pp.ConsentSource = 'Preference Center';
    pp.ConsentAt = new Date();
    pp.CommunicationLogID = params.LogID;
    pp.IPAddress = params.IPAddress ?? null;
    pp.UserAgent = params.UserAgent ?? null;
    if (!(await pp.Save())) {
        throw new Error(`Failed to save principal preference: ${pp.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    const audit = await md.GetEntityObject<MJCommunicationConsentAuditLogEntity>('MJ: Communication Consent Audit Logs', systemUser);
    audit.CommunicationPrincipalPreferenceID = pp.ID;
    audit.Action = existing ? 'Updated' : 'Created';
    audit.PreviousValue = prevValue;
    audit.NewValue = JSON.stringify({ State: pp.State });
    audit.Source = 'Preference Center';
    audit.CommunicationLogID = params.LogID;
    audit.IPAddress = params.IPAddress ?? null;
    audit.UserAgent = params.UserAgent ?? null;
    if (!(await audit.Save())) {
        throw new Error(`Failed to save consent audit log: ${audit.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

async function defaultSavePreferenceCenterChoices(
    input: SavePreferenceChoicesInput,
    provider?: IMetadataProvider,
): Promise<SavePreferenceChoicesResult> {
    const systemUser = getSystemUser();
    if (!systemUser) {
        return { Found: false, Success: false, UnsubscribedAll: false, Preferences: [] };
    }

    const md = getCommsProvider(provider);
    const data = await defaultResolvePreferenceCenterData(input.Token, md);
    if (!data) {
        return { Found: false, Success: false, UnsubscribedAll: false, Preferences: [] };
    }

    const found = await loadLogAndSenderByToken(input.Token, systemUser, md);
    if (!found) {
        return { Found: false, Success: false, UnsubscribedAll: false, Preferences: [] };
    }

    const principal = await resolvePrincipalFromLog(found.log, systemUser, md);
    const senderId = found.sender?.ID ?? null;
    const visibleIds = new Set(data.Preferences.map((p) => p.ID.toLowerCase()));

    if (input.UnsubscribeAll) {
        const supp = await md.GetEntityObject<MJCommunicationSuppressionEntity>('MJ: Communication Suppressions', systemUser);
        supp.CommunicationEndpointID = found.log.CommunicationEndpointID;
        supp.EntityID = principal?.EntityID ?? null;
        supp.RecordID = principal?.RecordID ?? null;
        supp.CommunicationSenderID = senderId;
        supp.CommunicationPreferenceID = null;
        supp.Reason = 'User Unsubscribe';
        supp.Source = 'Preference Center';
        supp.Status = 'Active';
        supp.EffectiveAt = new Date();
        supp.CommunicationLogID = found.log.ID;
        if (!(await supp.Save())) {
            return { Found: true, Success: false, UnsubscribedAll: false, Preferences: data.Preferences };
        }

        const suppAudit = await md.GetEntityObject<MJCommunicationConsentAuditLogEntity>(
            'MJ: Communication Consent Audit Logs',
            systemUser,
        );
        suppAudit.CommunicationSuppressionID = supp.ID;
        suppAudit.CommunicationLogID = found.log.ID;
        suppAudit.Action = 'Created';
        suppAudit.PreviousValue = null;
        suppAudit.NewValue = JSON.stringify({ Reason: 'User Unsubscribe', UnsubscribeAll: true });
        suppAudit.Source = 'Preference Center';
        suppAudit.IPAddress = input.IPAddress ?? null;
        suppAudit.UserAgent = input.UserAgent ?? null;
        if (!(await suppAudit.Save())) {
            LogError(`[CommsWebhook] Failed to save unsubscribe-all audit log: ${suppAudit.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }

        if (principal) {
            for (const pref of data.Preferences) {
                await upsertPrincipalPreferenceAndAudit(
                    {
                        EntityID: principal.EntityID,
                        RecordID: principal.RecordID,
                        PreferenceID: pref.ID,
                        SenderID: senderId,
                        State: 'Opted Out',
                        LogID: found.log.ID,
                        IPAddress: input.IPAddress,
                        UserAgent: input.UserAgent,
                    },
                    systemUser,
                );
            }
        }
    } else if (!principal) {
        return {
            Found: true,
            Success: false,
            UnsubscribedAll: false,
            Preferences: data.Preferences,
            ErrorMessage: 'Preferences could not be saved because this address does not map to a unique recipient profile. Use Unsubscribe All to suppress this address.',
        };
    } else if (input.Preferences) {
        const currentByPrefId = new Map(
            data.Preferences.map((p) => [p.ID.toLowerCase(), p.State]),
        );
        for (const choice of input.Preferences) {
            if (!visibleIds.has(choice.PreferenceID.toLowerCase())) continue;
            const currentState = currentByPrefId.get(choice.PreferenceID.toLowerCase());
            if (choice.State === currentState) continue;
            await upsertPrincipalPreferenceAndAudit(
                {
                    EntityID: principal.EntityID,
                    RecordID: principal.RecordID,
                    PreferenceID: choice.PreferenceID,
                    SenderID: senderId,
                    State: choice.State,
                    LogID: found.log.ID,
                    IPAddress: input.IPAddress,
                    UserAgent: input.UserAgent,
                },
                systemUser,
            );
        }
    }

    const updated = await defaultResolvePreferenceCenterData(input.Token);
    return {
        Found: true,
        Success: true,
        UnsubscribedAll: input.UnsubscribeAll,
        Preferences: updated?.Preferences ?? data.Preferences,
    };
}

async function defaultConfirmDoubleOptIn(
    input: ConfirmOptInInput,
    provider?: IMetadataProvider,
): Promise<ConfirmOptInResult> {
    const systemUser = getSystemUser();
    if (!systemUser) {
        return { Found: false, Confirmed: false };
    }

    const md = getCommsProvider(provider);
    const rv = RunView.FromMetadataProvider(md);
    const res = await rv.RunView<MJCommunicationPrincipalPreferenceEntity>(
        {
            EntityName: 'MJ: Communication Principal Preferences',
            ExtraFilter: `ConfirmationToken='${EscapeSQLString(input.Token)}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
        },
        systemUser,
    );
    if (!res.Success || res.Results.length === 0) {
        return { Found: false, Confirmed: false };
    }

    const pref = res.Results[0];
    if (pref.State === 'Opted In') {
        return {
            Found: true,
            Confirmed: true,
            AlreadyConfirmed: true,
            State: pref.State,
            ConfirmedAt: pref.ConfirmedAt?.toISOString(),
        };
    }
    if (pref.State === 'Opted Out') {
        return {
            Found: true,
            Confirmed: false,
            State: pref.State,
            ErrorMessage: 'Cannot confirm an opted-out preference',
        };
    }

    const prevValue = JSON.stringify({ State: pref.State, ConfirmedAt: pref.ConfirmedAt });
    const now = new Date();
    pref.State = 'Opted In';
    pref.ConfirmedAt = now;
    if (!(await pref.Save())) {
        return {
            Found: true,
            Confirmed: false,
            ErrorMessage: pref.LatestResult?.CompleteMessage ?? 'Failed to save confirmation',
        };
    }

    const audit = await md.GetEntityObject<MJCommunicationConsentAuditLogEntity>('MJ: Communication Consent Audit Logs', systemUser);
    audit.CommunicationPrincipalPreferenceID = pref.ID;
    audit.Action = 'Confirmed';
    audit.PreviousValue = prevValue;
    audit.NewValue = JSON.stringify({ State: pref.State, ConfirmedAt: now.toISOString() });
    audit.Source = 'Preference Center';
    audit.CommunicationLogID = pref.CommunicationLogID ?? null;
    audit.IPAddress = input.IPAddress ?? null;
    audit.UserAgent = input.UserAgent ?? null;
    if (!(await audit.Save())) {
        LogError(`[CommsWebhook] Failed to save confirmation audit log: ${audit.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    return {
        Found: true,
        Confirmed: true,
        State: 'Opted In',
        ConfirmedAt: now.toISOString(),
    };
}

let cachedElementBundlePath: string | null | undefined;
function resolvePreferenceElementBundlePath(): string | null {
    if (cachedElementBundlePath !== undefined) {
        return cachedElementBundlePath;
    }
    try {
        const req = createRequire(import.meta.url);
        const candidate = req.resolve('@memberjunction/ng-communications/dist/element/main.js');
        cachedElementBundlePath = fs.existsSync(candidate) ? candidate : null;
    } catch {
        cachedElementBundlePath = null;
    }
    return cachedElementBundlePath;
}
