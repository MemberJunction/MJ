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
import { RegisterClass } from '@memberjunction/global';
import {
    CommsActivityWorker,
    CommunicationEngine,
} from '@memberjunction/communication-engine';
import type {
    MessagePayload,
    NormalizedActivityEvent,
    ProviderCredentialsBase,
    RecipientSendTarget,
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
import {
    ResolveSendGridWebhookVerificationKey,
    type CommsActivityWorkPayload,
} from '../rest/CommsWebhookHandler.js';

export const COMMS_DISPATCH_HANDLER_KEY = 'comms.dispatch';
export const COMMS_RENDER_HANDLER_KEY = 'comms.render';
export const COMMS_ACTIVITY_HANDLER_KEY = 'comms.activity';

export interface CommsDispatchWorkPayload {
    CommunicationRunID?: string;
    Envelope: SendingEnvelope;
    Payload?: MessagePayload;
    Recipients: RecipientSendTarget[];
}

/**
 * Configures `CommunicationEngine` and `TemplatedCommunicationService` to publish
 * async chunks/batches onto `WorkQueueEngine` and use unified tracking URL/HMAC settings.
 */
export function ConfigureCommsV2WorkQueue(
    baseTrackingUrl?: string,
    trackingHmacSecret?: string,
): void {
    const resolvedSecret =
        trackingHmacSecret ??
        process.env.MJ_COMMS_HMAC_SECRET;

    CommunicationEngine.Instance.ConfigureV2Dispatch({
        BaseTrackingURL: baseTrackingUrl,
        TrackingHMACSecret: resolvedSecret,
        EnqueueWork: async (taskType, payload) => {
            const results = await WorkQueueEngine.Instance.Publish(taskType, [{ Payload: payload as WorkJson }]);
            const rejected = results.find((r) => r.Status === 'Rejected');
            if (rejected) {
                throw new Error(`WorkQueue publish rejected for '${taskType}' (${rejected.Error?.Code ?? 'Unknown'}): ${rejected.Error?.Message ?? ''}`);
            }
        },
    });

    TemplatedCommunicationService.Instance.Configure({
        EnqueueWork: async (taskType, payload) => {
            const results = await WorkQueueEngine.Instance.Publish(taskType, [{ Payload: payload as unknown as WorkJson }]);
            const rejected = results.find((r) => r.Status === 'Rejected');
            if (rejected) {
                throw new Error(`WorkQueue publish rejected for '${taskType}' (${rejected.Error?.Code ?? 'Unknown'}): ${rejected.Error?.Message ?? ''}`);
            }
        },
    });
}

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
        await CommunicationEngine.Instance.Config(false, this.ContextUser);
        const result = await CommunicationEngine.Instance.Send(
            {
                CommunicationRunID: payload.CommunicationRunID,
                Envelope: payload.Envelope,
                Payload: payload.Payload,
                Recipients: payload.Recipients,
            },
            this.ContextUser,
        );
        if (!result.Success) {
            const reason = result.ErrorMessage ?? 'comms.dispatch send failed';
            context.Log.Warn(`comms.dispatch failed and will retry: ${reason}`);
            return Outcome.Retry(reason);
        }
        return Outcome.Complete();
    }
}

@RegisterClass(BaseWorkHandler, COMMS_RENDER_HANDLER_KEY)
export class CommsRenderWorkHandler extends BaseWorkHandler<RenderBatchPayload & WorkJson> {
    public async Handle(
        message: WorkMessage<RenderBatchPayload & WorkJson>,
    ): Promise<WorkOutcome> {
        const payload = message.Payload;
        if (!payload?.Envelope || !Array.isArray(payload.Recipients)) {
            return Outcome.DeadLetter('Invalid comms.render payload: missing Envelope or Recipients');
        }
        await CommunicationEngine.Instance.Config(false, this.ContextUser);
        await TemplatedCommunicationService.Instance.HandleRenderBatch(payload, this.ContextUser);
        return Outcome.Complete();
    }
}

@RegisterClass(BaseWorkHandler, COMMS_ACTIVITY_HANDLER_KEY)
export class CommsActivityWorkHandler extends BaseWorkHandler<CommsActivityWorkPayload & WorkJson> {
    public async Handle(
        message: WorkMessage<CommsActivityWorkPayload & WorkJson>,
    ): Promise<WorkOutcome> {
        const payload = message.Payload;
        if (!payload?.Source) {
            return Outcome.DeadLetter('Invalid comms.activity payload: missing Source');
        }

        await CommunicationEngine.Instance.Config(false, this.ContextUser);
        const worker = new CommsActivityWorker();
        const events = await this.normalizePayloadEvents(payload);
        if (events.length > 0) {
            await worker.ProcessActivityBatch(events, this.ContextUser);
        }
        return Outcome.Complete();
    }

    private async normalizePayloadEvents(
        payload: CommsActivityWorkPayload,
    ): Promise<NormalizedActivityEvent[]> {
        if (payload.Source === 'sendgrid-webhook' && payload.RawBody) {
            const sgProvider = CommunicationEngine.Instance.GetProvider('SendGrid');
            if (sgProvider?.ParseNotification) {
                const webhookKey = await ResolveSendGridWebhookVerificationKey(payload.CredentialID);
                const credentials = webhookKey
                    ? ({ webhookVerificationKey: webhookKey } as ProviderCredentialsBase)
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
                return (parsed.Notifications ?? []).flatMap((n) => n.ActivityEvents ?? []);
            }
            return [];
        }

        if (!payload.EventType) {
            return [];
        }

        const sgEntity = CommunicationEngine.Instance.Providers.find((p) => p.Name === 'SendGrid');
        return [
            {
                CommunicationProviderID: sgEntity?.ID ?? '',
                NormalizedAddress: '',
                EventType: payload.EventType,
                OccurredAt: payload.OccurredAt ? new Date(payload.OccurredAt) : new Date(),
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
