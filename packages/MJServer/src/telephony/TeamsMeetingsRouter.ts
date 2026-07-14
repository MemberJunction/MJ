/**
 * @fileoverview Express wiring for the Teams meetings ingress — the Microsoft Graph change-notification webhook.
 *
 * One public surface (Graph cannot present an MJ JWT — the subscription validation-token handshake + the
 * per-notification `clientState` shared secret are the gate):
 *   - `POST /meetings/teams/notifications` — the Graph change-notification endpoint. Handles BOTH:
 *       1. The **subscription-validation handshake**: when Graph creates/renews a subscription it calls this
 *          URL with `?validationToken=…` and expects the exact token echoed back as `text/plain` 200.
 *       2. **Real call/participant notifications**: each carries a `clientState` verified (constant-time)
 *          against the secret set on subscription creation, then mapped to the meetings service's roster /
 *          call-ended drive helpers.
 *
 * Mirrors the Twilio telephony public-router pattern: mount the router BEFORE the unified auth middleware. The
 * validation + notification parsing use the offline-complete, unit-tested helpers from the Teams provider
 * package (`validateGraphNotification` / `parseCallNotification`); this module is thin HTTP plumbing over them
 * and the {@link TeamsMeetingsService}.
 *
 * The ACS application-hosted-media socket(s) (the audio plane) are owned by the server's native ACS media
 * adapter, which attaches transports to the shared {@link TeamsAcsMediaRegistry} — there is no media WSS here
 * (unlike Twilio Media Streams), because ACS app-hosted media is negotiated out-of-band by that adapter.
 *
 * @module @memberjunction/server/telephony
 */

import { Router, json, type Request, type Response } from 'express';
import { LogError, LogStatus } from '@memberjunction/core';
import {
    validateGraphNotification,
    parseCallNotification,
    type GraphChangeNotification,
} from '@memberjunction/ai-bridge-teams';
import type { TeamsMeetingsConfig } from '../config.js';
import { TeamsAcsMediaRegistry } from './teamsAcsMediaRegistry.js';
import { TeamsMeetingsService } from './TeamsMeetingsService.js';

/** The mount path for the Teams meetings public router. */
export const TEAMS_MEETINGS_MOUNT_PATH = '/meetings/teams';

/** The minimal shape of a Graph change-notification POST body (the `value[]` batch). */
interface GraphNotificationBatch {
    value?: GraphChangeNotification[];
}

/**
 * Builds the Teams meetings handler: the public Graph change-notification router + the shared ACS media
 * registry + the meetings service (returned for observability/tests + so server boot can bind the service to
 * the runtime holder and hand the registry to the native ACS media adapter).
 */
export function createTeamsMeetingsHandler(
    config: TeamsMeetingsConfig,
): {
    publicRouter: Router;
    registry: TeamsAcsMediaRegistry;
    service: TeamsMeetingsService;
} {
    const registry = new TeamsAcsMediaRegistry(config.acsSampleRate);
    const service = new TeamsMeetingsService(config, registry);
    const publicRouter = Router();

    // Graph posts JSON; it also issues the validation handshake as a query-param GET-like POST. Parse JSON but
    // tolerate an empty body on the handshake.
    publicRouter.post('/notifications', json({ type: () => true }), (req: Request, res: Response) => {
        handleGraphNotification(service, config, req, res);
    });

    return { publicRouter, registry, service };
}

/** Handles the Graph webhook: echo the validation token, else verify clientState + drive the service. */
function handleGraphNotification(
    service: TeamsMeetingsService,
    config: TeamsMeetingsConfig,
    req: Request,
    res: Response,
): void {
    const validationToken = readValidationToken(req);
    const batch = (req.body ?? {}) as GraphNotificationBatch;
    const notifications = Array.isArray(batch.value) ? batch.value : [];
    const clientStates = notifications.map((n) => n.clientState);

    const verdict = validateGraphNotification(validationToken, config.notificationClientState ?? '', clientStates);
    if (verdict.Kind === 'validation') {
        // The subscription-validation handshake: echo the token verbatim as text/plain 200.
        res.status(200).type('text/plain').send(verdict.ValidationToken);
        return;
    }
    if (verdict.Kind === 'reject') {
        LogStatus(`[Meetings][Teams] notification rejected: ${verdict.Reason}`);
        res.status(verdict.Reason === 'empty-validation-token' ? 400 : 403).type('text/plain').send('Rejected.');
        return;
    }

    dispatchNotifications(service, notifications);
    // Graph requires a fast 202 to acknowledge receipt; processing is fire-and-forget.
    res.status(202).end();
}

/** Maps each Graph call/participant notification to the meetings service's roster / call-ended drive helpers. */
function dispatchNotifications(service: TeamsMeetingsService, notifications: GraphChangeNotification[]): void {
    for (const notification of notifications) {
        try {
            const normalized = parseCallNotification(notification);
            if (normalized.state === 'terminated') {
                service.DriveCallEnded(normalized.callId);
            } else if (normalized.participants.length > 0) {
                service.DriveParticipantsUpdated(normalized.callId, normalized.participants);
            }
        } catch (e) {
            LogError(`[Meetings][Teams] failed to process notification: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

/** Reads the `?validationToken=…` query param (Graph URL-encodes it), when present. */
function readValidationToken(req: Request): string | undefined {
    const raw = req.query?.validationToken;
    if (typeof raw === 'string') {
        return raw;
    }
    if (Array.isArray(raw) && typeof raw[0] === 'string') {
        return raw[0];
    }
    return undefined;
}
