/**
 * @fileoverview Express wiring for the Teams meetings ingress — the Microsoft Graph change-notification webhook.
 *
 * @module @memberjunction/telephony-adapters
 */

import { Router, json, type Request, type Response } from 'express';
import { LogError, LogStatus } from '@memberjunction/core';
import {
    validateGraphNotification,
    parseCallNotification,
    type GraphChangeNotification,
} from '@memberjunction/ai-bridge-teams';
import type { TeamsMeetingsConfig } from '../types.js';
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
 * registry + the meetings service.
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
    if (validationToken !== undefined && validationToken.length > 0 && !isWellFormedValidationToken(validationToken)) {
        LogStatus('[Meetings][Teams] notification rejected: malformed-validation-token');
        res.status(400).type('text/plain').send('Rejected.');
        return;
    }
    const batch = (req.body ?? {}) as GraphNotificationBatch;
    const notifications = Array.isArray(batch.value) ? batch.value : [];
    const clientStates = notifications.map((n) => n.clientState);

    const verdict = validateGraphNotification(validationToken, config.notificationClientState ?? '', clientStates);
    if (verdict.Kind === 'validation') {
        res.status(200).type('text/plain').set('X-Content-Type-Options', 'nosniff').send(verdict.ValidationToken);
        return;
    }
    if (verdict.Kind === 'reject') {
        LogStatus(`[Meetings][Teams] notification rejected: ${verdict.Reason}`);
        res.status(verdict.Reason === 'empty-validation-token' ? 400 : 403).type('text/plain').send('Rejected.');
        return;
    }

    dispatchNotifications(service, notifications);
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

/** Upper bound for a Graph validation token. */
const MAX_VALIDATION_TOKEN_LENGTH = 1024;

/** Graph validation tokens are printable ASCII only. */
const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

function isWellFormedValidationToken(token: string): boolean {
    return token.length <= MAX_VALIDATION_TOKEN_LENGTH && PRINTABLE_ASCII.test(token);
}

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
