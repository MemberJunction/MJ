/**
 * @fileoverview Durable WorkQueue handlers and V2 dispatch wiring for Communications V2.
 *
 * Registers `BaseWorkHandler` implementations for:
 *   - `comms.dispatch` — chunked `V2SendService.Send()` execution
 *   - `comms.render`   — `TemplatedCommunicationService.HandleRenderBatch()`
 *   - `comms.activity` — `CommsActivityWorker.ProcessActivityBatch()` (webhooks, opens, clicks, unsubscribes)
 *
 * Also configures `CommunicationEngine.Instance.ConfigureV2Dispatch()` and
 * `TemplatedCommunicationService.Instance.Configure()` to publish onto `WorkQueueEngine.Instance`.
 *
 * @module @memberjunction/server/services/CommsWorkQueueHandlers
 */
import crypto from 'node:crypto';
import { RegisterClass } from '@memberjunction/global';
import {
    CommsActivityWorker,
    CommunicationEngine,
} from '@memberjunction/communication-engine';
import { NormalizeSendGridWebhookEvents } from '@memberjunction/communication-sendgrid';
import type {
    MessagePayload,
    NormalizedActivityEvent,
    ProviderCredentialsBase,
    RecipientSendTarget,
    RunChunkPosition,
    SendingEnvelope,
} from '@memberjunction/communication-types';
import {
    TemplatedCommunicationService,
    type RenderBatchPayload,
} from '@memberjunction/entity-communications-server';
import {
    Outcome,
    type WorkContext,
    type WorkJson,
    type WorkMessage,
    type WorkOutcome,
} from '@memberjunction/work-queue-core';
import { BaseWorkHandler, WorkQueueEngine } from '@memberjunction/work-queue-engine';
import type { IMetadataProvider, IRunViewProvider } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import {
    ResolveSendGridWebhookVerificationKey,
    type CommsActivityWorkPayload,
} from '../rest/CommsWebhookHandler.js';

/** Handler key (and topic name) for chunked V2 sends. */
export const COMMS_DISPATCH_HANDLER_KEY = 'comms.dispatch';
/** Handler key (and topic name) for templated render batches. */
export const COMMS_RENDER_HANDLER_KEY = 'comms.render';
/** Handler key (and topic name) for delivery and engagement activity. */
export const COMMS_ACTIVITY_HANDLER_KEY = 'comms.activity';

/**
 * A {@link SendingEnvelope} as it arrives off the queue: the payload went through JSON, so a
 * `ScheduledAt` that was a `Date` when published comes back as an ISO string.
 */
export type WireSendingEnvelope = Omit<SendingEnvelope, 'ScheduledAt'> & { ScheduledAt?: Date | string };

/** A {@link RenderBatchPayload} as it arrives off the queue (see {@link WireSendingEnvelope}). */
export type WireRenderBatchPayload = Omit<RenderBatchPayload, 'Envelope'> & { Envelope: WireSendingEnvelope };

/** Turns a queued envelope back into a {@link SendingEnvelope}, reviving `ScheduledAt` as a `Date`. */
export function ReviveSendingEnvelope(envelope: WireSendingEnvelope): SendingEnvelope {
    const { ScheduledAt, ...rest } = envelope;
    if (ScheduledAt == null) {
        return rest;
    }
    return { ...rest, ScheduledAt: ScheduledAt instanceof Date ? ScheduledAt : new Date(ScheduledAt) };
}

/** Whether the handler's provider can also run views, which the templated render path needs. */
function isRunViewProvider(provider: IMetadataProvider): provider is IMetadataProvider & IRunViewProvider {
    return (
        'RunView' in provider &&
        typeof provider.RunView === 'function' &&
        'RunViews' in provider &&
        typeof provider.RunViews === 'function'
    );
}

/** Payload of one `comms.dispatch` work item: one chunk of a V2 send. */
export interface CommsDispatchWorkPayload {
    CommunicationRunID?: string;
    Envelope: WireSendingEnvelope;
    Payload?: MessagePayload;
    Recipients: RecipientSendTarget[];
    ActingUserID?: string;
    /** This chunk's place in its run; `Send()` closes the run once every chunk has reported. */
    RunChunk?: RunChunkPosition;
}

interface SendGridWebhookParseCredentials extends ProviderCredentialsBase {
    webhookVerificationKey?: string;
    skipReplayWindow?: boolean;
}

function toWorkJson(value: object): WorkJson {
    return Object.fromEntries(Object.entries(value)) as WorkJson;
}

/**
 * Configures `CommunicationEngine` and `TemplatedCommunicationService` to publish
 * async chunks/batches onto `WorkQueueEngine` and use unified tracking URL/HMAC settings.
 */
export function ConfigureCommsV2WorkQueue(
    baseTrackingUrl?: string,
    trackingHmacSecret?: string,
    workQueueEnabled = true,
): void {
    const resolvedSecret =
        trackingHmacSecret ??
        process.env.MJ_COMMS_HMAC_SECRET;

    const enqueueWork = workQueueEnabled
        ? async (taskType: string, payload: object) => {
            if (WorkQueueEngine.Instance.Topics.length === 0) {
                await WorkQueueEngine.Instance.Config(false, CommunicationEngine.Instance.ContextUser);
            }
            const results = await WorkQueueEngine.Instance.Publish(taskType, [{ Payload: toWorkJson(payload) }]);
            const rejected = results.find((r) => r.Status === 'Rejected');
            if (rejected) {
                throw new Error(`WorkQueue publish rejected for '${taskType}' (${rejected.Error?.Code ?? 'Unknown'}): ${rejected.Error?.Message ?? ''}`);
            }
        }
        : undefined;

    CommunicationEngine.Instance.ConfigureV2Dispatch({
        BaseTrackingURL: baseTrackingUrl,
        TrackingHMACSecret: resolvedSecret,
        EnqueueWork: enqueueWork,
    });
    CommunicationEngine.Instance.StartScheduledDeferralSweep();

    TemplatedCommunicationService.Instance.Configure({
        EnqueueWork: enqueueWork,
        ResolveUser: (userID) => UserCache.Instance.UserByID(userID),
    });
}

/**
 * Sends one `comms.dispatch` chunk through `CommunicationEngine.Send()`. A send that cannot start
 * is retried; an item without an envelope or recipients is dead-lettered.
 */
@RegisterClass(BaseWorkHandler, COMMS_DISPATCH_HANDLER_KEY)
export class CommsDispatchWorkHandler extends BaseWorkHandler<CommsDispatchWorkPayload & WorkJson> {
    public async Handle(
        message: WorkMessage<CommsDispatchWorkPayload & WorkJson>,
        context: WorkContext,
    ): Promise<WorkOutcome> {
        const payload = message.Payload;
        if (!payload?.Envelope || !Array.isArray(payload.Recipients)) {
            return Outcome.DeadLetter('Invalid comms.dispatch payload: missing Envelope or Recipients');
        }
        await CommunicationEngine.Instance.Config(false, this.ContextUser, this.Provider);
        let dispatchUser = this.ContextUser;
        if (payload.ActingUserID) {
            const resolvedUser = UserCache.Instance.UserByID(payload.ActingUserID);
            if (!resolvedUser) {
                return Outcome.DeadLetter(`comms.dispatch acting user '${payload.ActingUserID}' not found`);
            }
            dispatchUser = resolvedUser;
        }
        const envelope = ReviveSendingEnvelope(payload.Envelope);
        const result = await CommunicationEngine.Instance.Send(
            {
                CommunicationRunID: payload.CommunicationRunID,
                Envelope: envelope,
                Payload: payload.Payload,
                Recipients: payload.Recipients,
                RunChunk: payload.RunChunk,
            },
            dispatchUser,
        );
        if (!result.Success) {
            const reason = result.ErrorMessage ?? 'comms.dispatch send failed';
            context.Log.Warn(`comms.dispatch failed and will retry: ${reason}`);
            return Outcome.Retry(reason);
        }
        return Outcome.Complete();
    }
}

/**
 * Renders and sends one `comms.render` batch through
 * `TemplatedCommunicationService.HandleRenderBatch()`.
 */
@RegisterClass(BaseWorkHandler, COMMS_RENDER_HANDLER_KEY)
export class CommsRenderWorkHandler extends BaseWorkHandler<WireRenderBatchPayload & WorkJson> {
    public async Handle(
        message: WorkMessage<WireRenderBatchPayload & WorkJson>,
    ): Promise<WorkOutcome> {
        const payload = message.Payload;
        if (!payload?.Envelope || !Array.isArray(payload.Recipients)) {
            return Outcome.DeadLetter('Invalid comms.render payload: missing Envelope or Recipients');
        }
        await CommunicationEngine.Instance.Config(false, this.ContextUser, this.Provider);
        const normalizedPayload: RenderBatchPayload = {
            CommunicationRunID: payload.CommunicationRunID,
            Envelope: ReviveSendingEnvelope(payload.Envelope),
            EntityID: payload.EntityID,
            Templates: payload.Templates,
            AutoAppendComplianceFooter: payload.AutoAppendComplianceFooter,
            Recipients: payload.Recipients,
            ActingUserID: payload.ActingUserID,
        };
        const result = await TemplatedCommunicationService.Instance.HandleRenderBatch(
            normalizedPayload,
            this.ContextUser,
            isRunViewProvider(this.Provider) ? this.Provider : undefined,
        );
        if (!result.Success) {
            return Outcome.Retry(result.ErrorMessage ?? 'comms.render batch failed');
        }
        return Outcome.Complete();
    }
}

/**
 * Normalizes one `comms.activity` item into activity events and applies them with
 * `CommsActivityWorker.ProcessActivityBatch()`. The item is retried when any event fails; events
 * already applied are skipped on the retry when they carry a provider event ID.
 */
@RegisterClass(BaseWorkHandler, COMMS_ACTIVITY_HANDLER_KEY)
export class CommsActivityWorkHandler extends BaseWorkHandler<CommsActivityWorkPayload & WorkJson> {
    public async Handle(
        message: WorkMessage<CommsActivityWorkPayload & WorkJson>,
    ): Promise<WorkOutcome> {
        const payload = message.Payload;
        if (!payload?.Source) {
            return Outcome.DeadLetter('Invalid comms.activity payload: missing Source');
        }

        await CommunicationEngine.Instance.Config(false, this.ContextUser, this.Provider);
        const worker = new CommsActivityWorker();
        const events = await this.normalizePayloadEvents(payload);
        if (events.length > 0) {
            const batchResult = await worker.ProcessActivityBatch(events, this.ContextUser);
            if (batchResult.ErrorCount > 0) {
                return Outcome.Retry(`${batchResult.ErrorCount} activity event(s) failed`);
            }
        }
        return Outcome.Complete();
    }

    private async normalizePayloadEvents(
        payload: CommsActivityWorkPayload,
    ): Promise<NormalizedActivityEvent[]> {
        const sgEntity = CommunicationEngine.Instance.Providers.find((p) => p.Name === 'SendGrid');
        if (payload.Source === 'sendgrid-webhook' && payload.RawBody) {
            let events: NormalizedActivityEvent[];
            if (payload.SignatureVerifiedAtIngress) {
                const rawItems: unknown = JSON.parse(payload.RawBody);
                events = Array.isArray(rawItems) ? NormalizeSendGridWebhookEvents(rawItems) : [];
            } else {
                const sgProvider = CommunicationEngine.Instance.GetProvider('SendGrid');
                if (!sgProvider?.ParseNotification) {
                    return [];
                }
                const webhookKey = await ResolveSendGridWebhookVerificationKey(payload.CredentialID);
                const credentials: SendGridWebhookParseCredentials | undefined = webhookKey
                    ? { webhookVerificationKey: webhookKey, skipReplayWindow: true }
                    : undefined;
                const parsed = await sgProvider.ParseNotification(
                    {
                        RawBody: payload.RawBody,
                        Headers: payload.Headers ?? {},
                        QueryParams: {},
                    },
                    credentials,
                );
                if (!parsed.Success) {
                    throw new Error(parsed.ErrorMessage ?? 'SendGrid ParseNotification failed');
                }
                events = (parsed.Notifications ?? []).flatMap((n) => n.ActivityEvents ?? []);
            }
            if (sgEntity?.ID) {
                for (const ev of events) {
                    if (!ev.CommunicationProviderID) {
                        ev.CommunicationProviderID = sgEntity.ID;
                    }
                }
            }
            return events;
        }

        if (!payload.EventType) {
            return [];
        }

        const occurredAt = payload.OccurredAt ? new Date(payload.OccurredAt) : new Date();
        const externalEventId = crypto
            .createHash('sha256')
            .update(
                JSON.stringify({
                    Source: payload.Source,
                    EventType: payload.EventType,
                    TrackingToken: payload.TrackingToken ?? null,
                    UnsubscribeToken: payload.UnsubscribeToken ?? null,
                    TargetURL: payload.TargetURL ?? null,
                    OccurredAt: payload.OccurredAt ?? occurredAt.toISOString(),
                }),
            )
            .digest('hex');

        // These hits come from MJ's own routes, not from a provider, so the provider is not known
        // here. Left empty, the activity worker takes it from the log the token identifies, which
        // is the provider that actually sent the message.
        return [
            {
                CommunicationProviderID: '',
                ProviderEventID: externalEventId,
                NormalizedAddress: '',
                EventType: payload.EventType,
                OccurredAt: occurredAt,
                Source: payload.Source === 'unsubscribe' ? 'One-Click Header' : 'Provider Webhook',
                TrackingToken: payload.TrackingToken,
                UnsubscribeToken: payload.UnsubscribeToken,
                TargetURL: payload.TargetURL,
                IPAddress: payload.IPAddress,
                UserAgent: payload.UserAgent,
                IsMachineEvent: false,
            },
        ];
    }
}
