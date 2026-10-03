/**
 * @fileoverview The PUBLIC verify-link routes of mid-session identity verification.
 *
 * Mounted BEFORE the unified auth middleware (the person opening the emailed link — often on another
 * device — holds no MJ token; the single-use token IS the capability).
 *
 * | Route | Effect |
 * |---|---|
 * | `GET  /realtime/verify/:token` | Renders a one-button confirmation page. **No side effects.** |
 * | `POST /realtime/verify` (form field `token`) | Redeems the token; renders "You're verified" or the uniform failure page. |
 *
 * ## Why the redemption is a POST
 *
 * Mail scanners and link previewers GET every URL in a message. A GET that consumed the single-use token
 * would let a scanner burn it before the human clicks. The magic-link redeem endpoint made the same
 * choice. The human's click submits the form.
 *
 * ## What the responses reveal
 *
 * Nothing about any session. A malformed token, an unknown session, an expired link, a used link and a
 * voided verification all render the SAME page with the SAME status; success is a bare "You're verified".
 * Responses are `no-store`, never framed, sent with `Referrer-Policy: no-referrer` (the token is in the
 * URL of the GET), and carry a CSP that forbids everything but the page's own inline style.
 *
 * @module @memberjunction/server/realtimeSessions
 */

import { Router, urlencoded, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { LogError } from '@memberjunction/core';
import { configInfo } from '../config.js';
import { RealtimeSessionVerificationService } from './RealtimeSessionVerificationService.js';
import { BuildVerifyConfirmHtml, BuildVerifyErrorHtml, BuildVerifyFailureHtml, BuildVerifySuccessHtml } from './verificationPages.js';

/** Mount path of the public verify routes. Under `/realtime`, which is already reserved against server extensions. */
export const REALTIME_VERIFY_MOUNT_PATH = '/realtime/verify';

/** Headers every verify response carries. */
function setSecurityHeaders(res: Response): void {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
}

/** Sends an HTML page with the verify security headers. */
function sendPage(res: Response, status: number, html: string): void {
    setSecurityHeaders(res);
    res.status(status).type('html').send(html);
}

/**
 * Builds the public verify router. Mount at {@link REALTIME_VERIFY_MOUNT_PATH} BEFORE the auth
 * middleware.
 *
 * @param service - the verification service (injectable for tests; defaults to the process singleton)
 */
export function CreateRealtimeVerifyRouter(
    service: Pick<RealtimeSessionVerificationService, 'RedeemLink'> = RealtimeSessionVerificationService.Instance,
): Router {
    const limits = configInfo.realtime?.identityVerification?.rateLimits;
    // The route is public and a redemption does a database read + write, so it is throttled per IP — the
    // same posture as the magic-link redeem endpoint. The message is the failure page, not JSON: this
    // route talks to a browser.
    const limiter = rateLimit({
        windowMs: limits?.redeemWindowMs ?? 60_000,
        limit: limits?.redeemPerIp ?? 30,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (_req: Request, res: Response) => sendPage(res, 429, BuildVerifyFailureHtml()),
    });

    const router = Router();

    // SAFE: renders the confirmation button. Never consumes the token (see the module header).
    router.get('/:token', limiter, (req: Request, res: Response) => {
        const token = typeof req.params.token === 'string' ? req.params.token : '';
        sendPage(res, 200, BuildVerifyConfirmHtml(token, REALTIME_VERIFY_MOUNT_PATH));
    });

    // The side-effecting redemption, gated by a human gesture.
    router.post('/', limiter, urlencoded({ extended: false, limit: '4kb' }), async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as { token?: unknown };
        const token = typeof body.token === 'string' ? body.token : '';
        try {
            const result = await service.RedeemLink(token, req.ip);
            if (result.Success) {
                sendPage(res, 200, BuildVerifySuccessHtml());
            } else if (result.ErrorCode === 'persist_failed') {
                // A server fault after a VALID token: the link is still redeemable, so say "try again".
                sendPage(res, 500, BuildVerifyErrorHtml());
            } else {
                // 410 for every other refusal: the page and status are identical whether the token was unknown,
                // malformed, expired or used, so the route cannot be used to probe sessions.
                sendPage(res, 410, BuildVerifyFailureHtml());
            }
        } catch (error) {
            LogError(`RealtimeVerifyRouter: redemption threw: ${error instanceof Error ? error.message : String(error)}`);
            sendPage(res, 500, BuildVerifyErrorHtml());
        }
    });

    return router;
}
