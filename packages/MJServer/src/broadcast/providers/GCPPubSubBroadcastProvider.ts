import { createHmac } from 'node:crypto';
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
 * Envelope published to a Google Cloud Pub/Sub role topic.
 */
export interface GCPPubSubTopicMessage {
    ProjectId: string;
    TopicName: string;
    Attributes: {
        roleId: string;
        entityName: string;
        action: string;
        sequence: string;
    };
    Event: CacheInvalidationNotification;
}

/**
 * Transport callback used by {@link GCPPubSubBroadcastProvider} to publish a shaped
 * invalidation notification to Google Cloud Pub/Sub.
 */
export type GCPPubSubTopicPublisher = (message: GCPPubSubTopicMessage) => Promise<void>;

/**
 * Topology 3 Cloud Multiplexer Provider for **Google Cloud Pub/Sub + Cloud Run WebSockets** (`'GCPPubSub'`).
 *
 * Offloads per-client WebSocket connection management and message fan-out from MJServer
 * to a Google Cloud Pub/Sub + Cloud Run WebSocket fan-out gateway:
 * - Each authenticated browser client calls `NegotiateCacheBroadcastConnection` to obtain
 *   a signed gateway token and its authorized Pub/Sub role subscription attributes
 *   (`projects/<projectId>/topics/<topicPrefix>-role-<RoleID>`).
 * - When an entity mutation occurs, MJServer shapes the invalidation payload once per
 *   authorized role on the entity and publishes a message with Pub/Sub filtering attributes.
 */
@RegisterClass(BaseCacheInvalidationBroadcastProvider, 'GCPPubSub')
export class GCPPubSubBroadcastProvider extends BaseCacheInvalidationBroadcastProvider {
    private _topicPublisher: GCPPubSubTopicPublisher | null = null;

    public override get Topology(): CacheInvalidationBroadcastTopology {
        return 'GCPPubSub';
    }

    /**
     * Installs a custom Google Cloud Pub/Sub topic publisher (e.g., `@google-cloud/pubsub` adapter or test spy).
     */
    public SetTopicPublisher(publisher: GCPPubSubTopicPublisher | null): void {
        this._topicPublisher = publisher;
    }

    /**
     * Computes the fully-qualified GCP Pub/Sub topic names for a user's roles.
     */
    public GetAuthorizedTopicsForUser(user: UserInfo): string[] {
        const projectId = this._config.gcpPubSub?.projectId || 'mj-default-project';
        const prefix = this._config.gcpPubSub?.topicPrefix || 'mj-cache';
        const roles = user.UserRoles ?? [];
        const topics: string[] = [];
        for (const r of roles) {
            const roleId = (r.RoleID ?? '').trim().toLowerCase();
            if (roleId.length > 0) {
                topics.push(`projects/${projectId}/topics/${prefix}-role-${roleId}`);
            }
        }
        topics.sort();
        return topics;
    }

    protected override async OnInvalidationRecorded(payload: CacheInvalidationPayload): Promise<void> {
        const projectId = this._config.gcpPubSub?.projectId || 'mj-default-project';
        const prefix = this._config.gcpPubSub?.topicPrefix || 'mj-cache';
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
            const message: GCPPubSubTopicMessage = {
                ProjectId: projectId,
                TopicName: `projects/${projectId}/topics/${prefix}-role-${roleId}`,
                Attributes: {
                    roleId,
                    entityName: payload.entityName,
                    action: payload.action,
                    sequence: String(payload.sequence ?? 0),
                },
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
        const gatewayUrl = (this._config.gcpPubSub?.gatewayUrl ?? '').replace(/\/+$/, '');
        const signingSecret = this._config.gcpPubSub?.signingSecret || '';
        const ttlSeconds = this._config.gcpPubSub?.tokenTtlSeconds ?? 3600;
        const expiresAtMs = Date.now() + ttlSeconds * 1000;
        const topics = this.GetAuthorizedTopicsForUser(user);

        if (!gatewayUrl) {
            return {
                Provider: this.Topology,
                Url: defaultGraphQLWsUrl,
                Groups: topics,
                ExpiresAt: new Date(expiresAtMs).toISOString(),
                ServerProcessID: this.ServerProcessID,
                CurrentSequence: this.CurrentSequence,
            };
        }

        const wsGatewayUrl = gatewayUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
        const token = signingSecret
            ? this.mintGatewayToken(user.ID, topics, Math.floor(expiresAtMs / 1000), signingSecret)
            : undefined;
        const url = token ? `${wsGatewayUrl}?token=${encodeURIComponent(token)}` : wsGatewayUrl;

        return {
            Provider: this.Topology,
            Url: url,
            Token: token,
            Groups: topics,
            ExpiresAt: new Date(expiresAtMs).toISOString(),
            ServerProcessID: this.ServerProcessID,
            CurrentSequence: this.CurrentSequence,
        };
    }

    private mintGatewayToken(
        subject: string,
        topics: string[],
        expSeconds: number,
        secret: string
    ): string {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const claims = Buffer.from(
            JSON.stringify({
                sub: subject,
                iat: Math.floor(Date.now() / 1000),
                exp: expSeconds,
                topics,
            })
        ).toString('base64url');
        const signingInput = `${header}.${claims}`;
        const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
        return `${signingInput}.${signature}`;
    }
}
