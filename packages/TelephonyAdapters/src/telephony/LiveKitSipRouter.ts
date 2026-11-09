/**
 * @fileoverview Express wiring for the LiveKit SIP ingress.
 *
 * One public surface: `POST <mount>/webhook`, the URL configured as a webhook on the LiveKit project. LiveKit cannot present
 * an MJ JWT, so the webhook's own signature is the gate: the request body is verified against the project's API secret before
 * anything is read from it, and a body that does not verify is refused. A verified event is acknowledged at once and handled
 * in the background (LiveKit retries a webhook that is slow to answer, and starting an agent takes seconds).
 *
 * The route reads the RAW body: the signature covers the exact bytes LiveKit sent, so a parsed-and-reserialised JSON body
 * would never verify.
 *
 * @module @memberjunction/telephony-adapters
 */

import { Router, raw, type Request, type Response } from 'express';
import { LogError } from '@memberjunction/core';
import type { LiveKitWebhookParser } from '@memberjunction/livekit-room-server';
import type { LiveKitSipSettings } from '../types.js';
import { ResolveInboundContext } from './runAsIdentity.js';
import type { LiveKitSipTelephonyService } from './LiveKitSipTelephonyService.js';

/** The mount path for the LiveKit SIP public router. */
export const LIVEKIT_SIP_MOUNT_PATH = '/telephony/livekit-sip';

/** The largest webhook body accepted. LiveKit's events are small; anything near this is not one. */
const WEBHOOK_BODY_LIMIT = '256kb';

/** What the webhook route needs from the service (a structural subset, so tests inject a fake). */
export type LiveKitSipServiceLike = Pick<LiveKitSipTelephonyService, 'HandleWebhookEvent' | 'RefuseInboundCall'>;

/** Creates the public router carrying the webhook route. */
export function CreateLiveKitSipRouter(service: LiveKitSipServiceLike, parser: Pick<LiveKitWebhookParser, 'Parse'>, settings: LiveKitSipSettings): Router {
    const router = Router();
    router.post('/webhook', raw({ type: () => true, limit: WEBHOOK_BODY_LIMIT }), (req, res) => {
        void HandleLiveKitWebhook(service, parser, settings, req, res);
    });
    return router;
}

/** Handles one webhook delivery: verify, acknowledge, then handle the event in the background. */
export async function HandleLiveKitWebhook(
    service: LiveKitSipServiceLike,
    parser: Pick<LiveKitWebhookParser, 'Parse'>,
    settings: LiveKitSipSettings,
    req: Request,
    res: Response,
): Promise<void> {
    if (!Buffer.isBuffer(req.body)) {
        LogError('[Telephony][LiveKitSip] webhook body was not read as raw bytes; the signature cannot be checked. Is another body parser mounted ahead of this route?');
        res.status(400).end();
        return;
    }
    let event;
    try {
        event = await parser.Parse(req.body.toString('utf8'), req.get('authorization') ?? undefined);
    } catch (e) {
        LogError(`[Telephony][LiveKitSip] rejected a webhook that did not verify: ${e instanceof Error ? e.message : String(e)}`);
        res.status(401).end();
        return;
    }
    res.status(200).end();
    const context = ResolveInboundContext(settings.inboundRunAsUserEmail);
    if (!context.Ok) {
        // Only a new call needs a principal; room_finished and other events are cheap and harmless without one.
        if (event.Event === 'participant_joined' && event.IsSipParticipant) {
            LogError(`[Telephony][LiveKitSip] inbound call in ${event.RoomName} refused: ${context.Reason}`);
            await service.RefuseInboundCall(event);
        }
        return;
    }
    try {
        await service.HandleWebhookEvent(event, context.User, context.Provider);
    } catch (e) {
        LogError(`[Telephony][LiveKitSip] handling ${event.Event} for ${event.RoomName} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}
