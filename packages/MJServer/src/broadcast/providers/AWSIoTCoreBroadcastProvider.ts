import { createHash, createHmac } from 'node:crypto';
import { RegisterClass } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import {
    BaseCacheInvalidationBroadcastProvider,
    CacheBroadcastNegotiationResult,
    CacheInvalidationBroadcastTopology,
} from '../BaseCacheInvalidationBroadcastProvider.js';
import type {
    CacheInvalidationNotification,
    CacheInvalidationPayload,
} from '../../generic/CacheInvalidationResolver.js';

/**
 * Envelope published to an AWS IoT Core MQTT role topic.
 */
export interface AWSIoTCoreTopicMessage {
    Topic: string;
    QoS: 0 | 1;
    Event: CacheInvalidationNotification;
}

/**
 * Transport callback used by {@link AWSIoTCoreBroadcastProvider} to publish a shaped
 * invalidation notification to an AWS IoT Core MQTT topic.
 */
export type AWSIoTCoreTopicPublisher = (message: AWSIoTCoreTopicMessage) => Promise<void>;

/**
 * Topology 3 Cloud Multiplexer Provider for **AWS IoT Core MQTT over WebSockets** (`'AWSIoTCore'`).
 *
 * Offloads per-client WebSocket connection management and message fan-out from MJServer
 * to AWS IoT Core's managed MQTT message broker:
 * - Each authenticated browser client calls `NegotiateCacheBroadcastConnection` to obtain
 *   a SigV4-presigned `wss://<endpoint>/mqtt` URL and its authorized MQTT topic list
 *   (`<topicPrefix>/roles/<RoleID>`).
 * - When an entity mutation occurs, MJServer shapes the invalidation payload once per
 *   authorized role on the entity and publishes to `<topicPrefix>/roles/<RoleID>`.
 */
@RegisterClass(BaseCacheInvalidationBroadcastProvider, 'AWSIoTCore')
export class AWSIoTCoreBroadcastProvider extends BaseCacheInvalidationBroadcastProvider {
    private _topicPublisher: AWSIoTCoreTopicPublisher | null = null;

    public override get Topology(): CacheInvalidationBroadcastTopology {
        return 'AWSIoTCore';
    }

    /**
     * Installs a custom MQTT topic publisher (e.g., AWS SDK `IoTDataPlaneClient` adapter or test spy).
     */
    public SetTopicPublisher(publisher: AWSIoTCoreTopicPublisher | null): void {
        this._topicPublisher = publisher;
    }

    /**
     * Computes the MQTT topic filters (`<topicPrefix>/roles/<roleId>`) for a user's roles.
     */
    public GetAuthorizedTopicsForUser(user: UserInfo): string[] {
        const prefix = (this._config.awsIoTCore?.topicPrefix || 'mj/cache').replace(/\/+$/, '');
        const roles = user.UserRoles ?? [];
        const topics: string[] = [];
        for (const r of roles) {
            const roleId = (r.RoleID ?? '').trim().toLowerCase();
            if (roleId.length > 0) {
                topics.push(`${prefix}/roles/${roleId}`);
            }
        }
        topics.sort();
        return topics;
    }

    protected override async OnInvalidationRecorded(payload: CacheInvalidationPayload): Promise<void> {
        const prefix = (this._config.awsIoTCore?.topicPrefix || 'mj/cache').replace(/\/+$/, '');
        const entity = this.ResolveEntityForPayload(payload);
        if (!entity) {
            return;
        }

        for (const perm of entity.Permissions) {
            if (!perm.CanRead) continue;
            const roleId = (perm.RoleID ?? '').trim().toLowerCase();
            if (!roleId) continue;

            const syntheticRoleHolder = { UserRoles: [{ RoleID: roleId }] };
            const shaped = this.ShapeEventForSubscriber(payload, syntheticRoleHolder, entity);
            const message: AWSIoTCoreTopicMessage = {
                Topic: `${prefix}/roles/${roleId}`,
                QoS: 1,
                Event: shaped,
            };

            if (this._topicPublisher) {
                await this._topicPublisher(message);
            }
        }
    }

    public override async NegotiateClientConnection(
        user: UserInfo,
        defaultGraphQLWsUrl = '/graphql'
    ): Promise<CacheBroadcastNegotiationResult> {
        const endpoint = (this._config.awsIoTCore?.endpoint ?? '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        const region = this._config.awsIoTCore?.region || 'us-east-1';
        const ttlSeconds = this._config.awsIoTCore?.tokenTtlSeconds ?? 3600;
        const expiresAtMs = Date.now() + ttlSeconds * 1000;
        const topics = this.GetAuthorizedTopicsForUser(user);

        if (!endpoint) {
            return {
                Provider: this.Topology,
                Url: defaultGraphQLWsUrl,
                Groups: topics,
                ExpiresAt: new Date(expiresAtMs).toISOString(),
                ServerProcessID: this.ServerProcessID,
                CurrentSequence: this.CurrentSequence,
            };
        }

        const accessKeyId = this._config.awsIoTCore?.accessKeyId;
        const secretAccessKey = this._config.awsIoTCore?.secretAccessKey;
        const presignedUrl =
            accessKeyId && secretAccessKey
                ? this.buildSigV4PresignedMqttUrl(endpoint, region, accessKeyId, secretAccessKey, ttlSeconds)
                : `wss://${endpoint}/mqtt`;

        return {
            Provider: this.Topology,
            Url: presignedUrl,
            Groups: topics,
            ExpiresAt: new Date(expiresAtMs).toISOString(),
            ServerProcessID: this.ServerProcessID,
            CurrentSequence: this.CurrentSequence,
        };
    }

    private buildSigV4PresignedMqttUrl(
        host: string,
        region: string,
        accessKeyId: string,
        secretAccessKey: string,
        expiresSeconds: number
    ): string {
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.slice(0, 8);
        const service = 'iotdevicegateway';
        const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
        const queryParams = [
            `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
            `X-Amz-Credential=${encodeURIComponent(`${accessKeyId}/${credentialScope}`)}`,
            `X-Amz-Date=${amzDate}`,
            `X-Amz-Expires=${expiresSeconds}`,
            `X-Amz-SignedHeaders=host`,
        ].join('&');

        const canonicalRequest = [
            'GET',
            '/mqtt',
            queryParams,
            `host:${host}\n`,
            'host',
            createHash('sha256').update('').digest('hex'),
        ].join('\n');

        const stringToSign = [
            'AWS4-HMAC-SHA256',
            amzDate,
            credentialScope,
            createHash('sha256').update(canonicalRequest).digest('hex'),
        ].join('\n');

        const kDate = createHmac('sha256', `AWS4${secretAccessKey}`).update(dateStamp).digest();
        const kRegion = createHmac('sha256', kDate).update(region).digest();
        const kService = createHmac('sha256', kRegion).update(service).digest();
        const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
        const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

        return `wss://${host}/mqtt?${queryParams}&X-Amz-Signature=${signature}`;
    }
}
