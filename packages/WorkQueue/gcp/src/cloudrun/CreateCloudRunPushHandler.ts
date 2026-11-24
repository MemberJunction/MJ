import type { IncomingMessage, ServerResponse } from 'node:http';
import {
    ConsumerRuntime,
    type SettleResult,
    type SubscriptionBinding,
    type WorkHandler,
    type WorkJson,
    type WorkLogger,
} from '@memberjunction/work-queue-core';
import { ReadGcpSubscriptionConfig } from '../config';
import { PubSubTransportConsumer } from '../consumer/PubSubTransportConsumer';
import { CreatePubSubDataClients, type GcpCredentialsOption } from '../gateway/pubSubClient';
import type {
    PubSubGateway,
    PubSubOutgoingMessage,
    PubSubPublishEntryResult,
} from '../gateway/PubSubGateway';
import { ParseGcpSubscriptionBindingEnv, SUBSCRIPTION_ENV_VAR } from './bindingEnv';
import {
    ExtractBearerToken,
    ParsePubSubPushEnvelope,
    ToPubSubReceivedRecord,
    type CloudRunPushHttpRequest,
    type CloudRunPushHttpResponse,
} from './cloudRunTypes';
import { FormatTelemetryLine, type InvocationMetrics } from './telemetry';

export interface CloudRunPushAuthContext {
    BearerToken: string | null;
    Headers: Record<string, string | string[] | undefined>;
    Request: CloudRunPushHttpRequest;
}

export type CloudRunPushAuthVerifier = (context: CloudRunPushAuthContext) => Promise<boolean> | boolean;

export interface CloudRunPushHandlerOptions {
    Binding?: SubscriptionBinding;
    Env?: Record<string, string | undefined>;
    Gateway?: PubSubGateway;
    Credentials?: GcpCredentialsOption;
    /** Require a non-empty `Authorization: Bearer <token>` header. Default false. */
    RequireBearerToken?: boolean;
    /** Optional OIDC / bearer token verifier hook. Returning false yields HTTP 403. */
    VerifyAuth?: CloudRunPushAuthVerifier;
    /** HTTP status code emitted on ACK (Completed or DeadLettered). Default 200 (204 is also supported). */
    AckStatusCode?: 200 | 204;
    /** Stop processing and abort this long before invocation timeout. Default 10,000 ms. */
    TimeoutSafetyMs?: number;
    /** Default Cloud Run request timeout budget when external deadline is unknown. Default 300,000 ms. */
    DefaultInvocationTimeoutMs?: number;
    Log?: WorkLogger;
    EmitMetrics?: (line: string) => void;
    Now?: () => number;
}

export type CloudRunPushHandler = (request: CloudRunPushHttpRequest) => Promise<CloudRunPushHttpResponse>;

const JSON_LOGGER: WorkLogger = {
    Info: (message, data) => console.log(JSON.stringify({ level: 'info', message, ...data })),
    Warn: (message, data) => console.warn(JSON.stringify({ level: 'warn', message, ...data })),
    Error: (message, error, data) => console.error(JSON.stringify({ level: 'error', message, error: error?.message, ...data })),
};

/**
 * Lightweight data-plane gateway for Cloud Run HTTP Push mode.
 * ACK/NACK happen via the HTTP response status code; only dead-letter topic publishing uses PublisherClient
 * (when configured), and SdkPubSubAdminGateway / adminClient are never imported.
 */
class PushContextGateway implements PubSubGateway {
    public LastRetryDelaySeconds = 0;

    constructor(
        private readonly deadLetterSender?: { Publish(topic: string, msg: PubSubOutgoingMessage): Promise<string>; Close(): Promise<void> },
    ) {}

    public async Publish(topicName: string, message: PubSubOutgoingMessage): Promise<string> {
        if (this.deadLetterSender) {
            return this.deadLetterSender.Publish(topicName, message);
        }
        return message.MessageId;
    }

    public async PublishBatch(topicName: string, messages: PubSubOutgoingMessage[]): Promise<PubSubPublishEntryResult[]> {
        const results: PubSubPublishEntryResult[] = [];
        for (const msg of messages) {
            const id = await this.Publish(topicName, msg);
            results.push({ Id: msg.MessageId, Kind: 'Published', ServerMessageId: id });
        }
        return results;
    }

    public async Pull(): Promise<[]> {
        return [];
    }

    public async Acknowledge(): Promise<boolean> {
        return true;
    }

    public async ModifyAckDeadline(request: { AckDeadlineSeconds: number }): Promise<boolean> {
        this.LastRetryDelaySeconds = request.AckDeadlineSeconds;
        return true;
    }

    public async PullDeadLetters(): Promise<[]> {
        return [];
    }

    public async AcknowledgeDeadLetter(): Promise<boolean> {
        return false;
    }

    public async NackDeadLetter(): Promise<boolean> {
        return false;
    }

    public async Close(): Promise<void> {
        if (this.deadLetterSender) {
            await this.deadLetterSender.Close();
        }
    }
}

function createDeadLetterPublisher(
    binding: SubscriptionBinding,
    options: CloudRunPushHandlerOptions,
    env: Record<string, string | undefined>,
): { Publish(topic: string, msg: PubSubOutgoingMessage): Promise<string>; Close(): Promise<void> } | undefined {
    const subConfig = ReadGcpSubscriptionConfig(binding.Config);
    const projectId = subConfig.ProjectId ?? env['GOOGLE_CLOUD_PROJECT'] ?? env['GCP_PROJECT_ID'];
    if (!subConfig.DeadLetterTopicName || !projectId) {
        return undefined;
    }
    const dataBundle = CreatePubSubDataClients(
        {
            ProjectId: projectId,
            ApiEndpoint: env['PUBSUB_EMULATOR_HOST'] ?? null,
            UseEmulator: Boolean(env['PUBSUB_EMULATOR_HOST']),
        },
        options.Credentials,
    );
    return {
        async Publish(topicName: string, msg: PubSubOutgoingMessage): Promise<string> {
            const fullTopic = topicName.startsWith('projects/') ? topicName : `projects/${dataBundle.ProjectId}/topics/${topicName}`;
            const [res] = await dataBundle.Publisher.publish({
                topic: fullTopic,
                messages: [{
                    data: Buffer.from(msg.Data, 'utf8'),
                    attributes: { ...msg.Attributes },
                    ...(msg.OrderingKey ? { orderingKey: msg.OrderingKey } : {}),
                }],
            });
            return res.messageIds?.[0] ?? msg.MessageId;
        },
        Close: () => dataBundle.Close(),
    };
}

function response(
    statusCode: number,
    body: CloudRunPushHandlerResponseBody,
    extraHeaders: Record<string, string> = {},
): CloudRunPushHttpResponse {
    return {
        StatusCode: statusCode,
        Headers: { 'content-type': 'application/json', ...extraHeaders },
        Body: body,
    };
}

type CloudRunPushHandlerResponseBody = CloudRunPushHttpResponse['Body'];

function tally(metrics: InvocationMetrics, result: SettleResult | undefined): void {
    metrics.Processed += 1;
    if (result?.Kind === 'Settled') {
        if (result.Status === 'Completed') metrics.Completed += 1;
        else if (result.Status === 'DeadLettered') metrics.DeadLettered += 1;
        else metrics.Retried += 1;
    } else {
        metrics.Failed += 1;
    }
}

/**
 * Creates a Cloud Run HTTP Push handler for Google Cloud Pub/Sub push subscriptions.
 * Returns HTTP 200/204 for ACK (Completed or DeadLettered), 400 for malformed push payloads,
 * 401/403 for auth rejections, and 503/500 for retryable NACKs so Pub/Sub redelivers cleanly.
 */
export function CreateCloudRunPushHandler<TPayload extends WorkJson = WorkJson>(
    handlerFactory: () => WorkHandler<TPayload>,
    options: CloudRunPushHandlerOptions = {},
): CloudRunPushHandler {
    const now = options.Now ?? Date.now;
    const log = options.Log ?? JSON_LOGGER;
    const emit = options.EmitMetrics ?? ((line: string) => console.log(line));
    const ackStatus = options.AckStatusCode ?? 200;
    const safetyMs = options.TimeoutSafetyMs ?? 10_000;
    const defaultTimeoutMs = options.DefaultInvocationTimeoutMs ?? 300_000;

    let cachedBinding: SubscriptionBinding | null = null;
    const resolveBinding = (): SubscriptionBinding => {
        if (cachedBinding === null) {
            const env = options.Env ?? process.env;
            cachedBinding = options.Binding ?? ParseGcpSubscriptionBindingEnv(env[SUBSCRIPTION_ENV_VAR]);
        }
        return cachedBinding;
    };

    return async (request) => {
        const started = now();
        const headers = request.Headers ?? {};
        const bearerToken = ExtractBearerToken(headers);

        if (options.RequireBearerToken && !bearerToken) {
            return response(401, {
                Status: 'Unauthorized',
                Reason: 'Missing or malformed Authorization Bearer token',
                DurationMs: now() - started,
            });
        }
        if (options.VerifyAuth) {
            const allowed = await options.VerifyAuth({ BearerToken: bearerToken, Headers: headers, Request: request });
            if (!allowed) {
                return response(bearerToken ? 403 : 401, {
                    Status: bearerToken ? 'Forbidden' : 'Unauthorized',
                    Reason: 'Push authentication verification failed',
                    DurationMs: now() - started,
                });
            }
        }

        const pushEnvelope = ParsePubSubPushEnvelope(request.Body);
        if (!pushEnvelope) {
            return response(400, {
                Status: 'BadRequest',
                Reason: 'Request body is not a valid Pub/Sub HTTP push payload',
                DurationMs: now() - started,
            });
        }

        const binding = resolveBinding();
        const env = options.Env ?? process.env;
        const providedGateway = options.Gateway;
        const ownedPublisher = providedGateway ? undefined : createDeadLetterPublisher(binding, options, env);
        const dlqSender = providedGateway
            ? {
                Publish: (topicName: string, msg: PubSubOutgoingMessage) => providedGateway.Publish(topicName, msg),
                Close: () => Promise.resolve(),
            }
            : ownedPublisher;
        const pushGateway = new PushContextGateway(dlqSender);
        const gateway: PubSubGateway = pushGateway;

        const consumer = new PubSubTransportConsumer<TPayload>(gateway, binding, { Now: now });
        const runtime = new ConsumerRuntime<TPayload>(
            consumer,
            handlerFactory,
            binding.Policy,
            { Concurrency: 1, ReceiveBatchSize: 1, IdlePollMinMs: 0, IdlePollMaxMs: 0, ShutdownDrainMs: 0 },
            log,
            now,
        );

        const metrics: InvocationMetrics = { Processed: 0, Completed: 0, Retried: 0, DeadLettered: 0, Failed: 0, DurationMs: 0 };
        const timer = setTimeout(() => {
            void runtime.Stop();
        }, Math.max(0, defaultTimeoutMs - safetyMs));
        const onAbort = (): void => {
            void runtime.Stop();
        };
        request.Signal?.addEventListener('abort', onAbort, { once: true });

        const record = ToPubSubReceivedRecord(pushEnvelope);
        try {
            const delivery = await consumer.Adopt(record);
            if (delivery === null) {
                metrics.DeadLettered += 1;
                return response(ackStatus, {
                    Status: 'DeadLettered',
                    MessageID: record.ServerMessageId,
                    Subscription: binding.Policy.SubscriptionName,
                    Reason: 'Envelope rejected and dead-lettered by receive guard',
                    DurationMs: now() - started,
                });
            }

            const [settleResult] = await runtime.ProcessBatch([delivery]);
            tally(metrics, settleResult);

            if (settleResult?.Kind === 'Settled' && settleResult.Status === 'Completed') {
                return response(ackStatus, {
                    Status: 'Completed',
                    MessageID: delivery.DeliveryID,
                    Subscription: binding.Policy.SubscriptionName,
                    DurationMs: now() - started,
                });
            }
            if (settleResult?.Kind === 'Settled' && settleResult.Status === 'DeadLettered') {
                return response(ackStatus, {
                    Status: 'DeadLettered',
                    MessageID: delivery.DeliveryID,
                    Subscription: binding.Policy.SubscriptionName,
                    DurationMs: now() - started,
                });
            }

            const retryHeaders: Record<string, string> = pushGateway.LastRetryDelaySeconds > 0
                ? { 'retry-after': String(pushGateway.LastRetryDelaySeconds) }
                : {};
            return response(
                503,
                {
                    Status: 'Retry',
                    MessageID: delivery.DeliveryID,
                    Subscription: binding.Policy.SubscriptionName,
                    Reason: settleResult?.Kind === 'Failed' ? settleResult.Error : 'Retryable nack requested',
                    DurationMs: now() - started,
                },
                retryHeaders,
            );
        } catch (error) {
            const errObj = error instanceof Error ? error : new Error(String(error));
            log.Error('Cloud Run Pub/Sub push handler failed', errObj, { messageId: record.ServerMessageId });
            metrics.Failed += 1;
            return response(500, {
                Status: 'Error',
                MessageID: record.ServerMessageId,
                Subscription: binding.Policy.SubscriptionName,
                Reason: errObj.message,
                DurationMs: now() - started,
            });
        } finally {
            clearTimeout(timer);
            request.Signal?.removeEventListener('abort', onAbort);
            if (ownedPublisher) {
                await ownedPublisher.Close().catch(() => undefined);
            }
            metrics.DurationMs = now() - started;
            emit(FormatTelemetryLine(binding.Policy.SubscriptionName, metrics, now()));
        }
    };
}

/** Reads a Node.js `http.IncomingMessage` body and writes the `CloudRunPushHttpResponse` to `ServerResponse`. */
export async function HandleNodeHttpPushRequest(
    handler: CloudRunPushHandler,
    req: IncomingMessage,
    res: ServerResponse,
): Promise<CloudRunPushHttpResponse> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    const controller = new AbortController();
    req.once('close', () => controller.abort());
    const result = await handler({
        Body: Buffer.concat(chunks),
        Headers: req.headers,
        Signal: controller.signal,
    });
    res.statusCode = result.StatusCode;
    for (const [k, v] of Object.entries(result.Headers)) {
        res.setHeader(k, v);
    }
    if (result.StatusCode === 204) {
        res.end();
    } else {
        res.end(JSON.stringify(result.Body));
    }
    return result;
}
