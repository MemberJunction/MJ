/**
 * @module @memberjunction/messaging-adapters
 * @description Slack webhook signature verification and route utilities.
 *
 * Slack sends a signature with every webhook request. This module provides
 * HMAC-SHA256 verification with replay attack protection.
 *
 * @see https://api.slack.com/authentication/verifying-requests-from-slack
 */

import { Request } from 'express';
import crypto from 'crypto';

/** Maximum age of a valid Slack request (5 minutes in seconds). */
const MAX_REQUEST_AGE_SECONDS = 300;

/**
 * Verify that a Slack webhook request is authentic using HMAC-SHA256.
 *
 * Performs two checks:
 * 1. **Timestamp freshness**: Rejects requests older than 5 minutes to prevent replay attacks
 * 2. **Signature verification**: Computes HMAC-SHA256 of `v0:{timestamp}:{body}` and compares
 *    with the signature header using `crypto.timingSafeEqual` to prevent timing attacks
 *
 * @param req - Express request object. Must have `x-slack-request-timestamp` and
 *              `x-slack-signature` headers, and a parsed `req.body`.
 * @param signingSecret - Slack app signing secret from the app configuration page.
 * @returns `true` if the request is authentic, `false` otherwise.
 *
 * @example
 * ```typescript
 * app.post('/webhook/slack', (req, res) => {
 *     if (!verifySlackSignature(req, process.env.SLACK_SIGNING_SECRET)) {
 *         return res.status(401).send('Invalid signature');
 *     }
 *     // Process the request...
 * });
 * ```
 */
export function verifySlackSignature(req: Request, signingSecret: string): boolean {
    const timestamp = req.headers['x-slack-request-timestamp'] as string | undefined;
    const signature = req.headers['x-slack-signature'] as string | undefined;

    if (!timestamp || !signature) {
        return false;
    }

    // Prevent replay attacks: reject requests older than 5 minutes
    if (isRequestTooOld(timestamp)) {
        return false;
    }

    // Compute expected signature
    const expectedSignature = computeSignature(req.body, timestamp, signingSecret);

    // Use timing-safe comparison to prevent timing attacks
    return safeCompare(expectedSignature, signature);
}

/**
 * Check if a Slack request timestamp is too old (> 5 minutes).
 *
 * @param timestamp - Unix timestamp string from `x-slack-request-timestamp` header.
 * @returns `true` if the request is older than 5 minutes.
 */
function isRequestTooOld(timestamp: string): boolean {
    const requestTime = parseInt(timestamp, 10);
    if (isNaN(requestTime)) {
        return true;
    }
    const currentTime = Math.floor(Date.now() / 1000);
    return (currentTime - requestTime) > MAX_REQUEST_AGE_SECONDS;
}

/**
 * Compute the HMAC-SHA256 signature for a Slack request.
 *
 * @param body - Parsed request body (will be JSON.stringified).
 * @param timestamp - Unix timestamp string.
 * @param signingSecret - Slack app signing secret.
 * @returns Signature string in format `v0={hex_hash}`.
 */
function computeSignature(body: unknown, timestamp: string, signingSecret: string): string {
    const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
    const sigBasestring = `v0:${timestamp}:${rawBody}`;
    const hmac = crypto
        .createHmac('sha256', signingSecret)
        .update(sigBasestring)
        .digest('hex');
    return `v0=${hmac}`;
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 *
 * @param expected - Expected signature.
 * @param actual - Actual signature from the request header.
 * @returns `true` if the signatures match.
 */
function safeCompare(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);

    if (expectedBuffer.length !== actualBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
