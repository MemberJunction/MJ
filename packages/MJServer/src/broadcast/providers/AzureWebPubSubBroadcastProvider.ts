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
 * Envelope published to an Azure Web PubSub role group.
 */
export interface AzureWebPubSubGroupMessage {
    HubName: string;
    GroupName: string;
    Event: CacheInvalidationNotification;
}

/**
 * Transport callback used by {@link AzureWebPubSubBroadcastProvider} to deliver a shaped
 * invalidation notification to an Azure Web PubSub group.
 */
export type AzureWebPubSubGroupPublisher = (message: AzureWebPubSubGroupMessage) => Promise<void>;

/**
 * Topology 3 Cloud Multiplexer Provider for **Azure Web PubSub** (`'AzureWebPubSub'`).
 *
 * Offloads per-client WebSocket connection management and message fan-out from MJServer
 * to Azure Web PubSub:
 * - Each authenticated browser client calls `NegotiateCacheBroadcastConnection` to receive
 *   a short-lived, HMAC-signed JWT access token scoped to its authorized role groups (`mj-role-<RoleID>`).
 * - When an entity mutation occurs, MJServer shapes the invalidation payload once per
 *   authorized role group on the entity and publishes a single group broadcast to Azure Web PubSub,
 *   which fans the message out to thousands of connected browsers in C++ edge infrastructure.
 */
@RegisterClass(BaseCacheInvalidationBroadcastProvider, 'AzureWebPubSub')
export class AzureWebPubSubBroadcastProvider extends BaseCacheInvalidationBroadcastProvider {
    private _groupPublisher: AzureWebPubSubGroupPublisher | null = null;

    public override get Topology(): CacheInvalidationBroadcastTopology {
        return 'AzureWebPubSub';
    }

    /**
     * Installs a custom group publisher (e.g., Azure WebPubSubServiceClient adapter or test spy).
     * When unset and an HTTP endpoint + accessKey are configured, defaults to the Azure Web PubSub
     * REST Data Plane API (`POST /api/hubs/{hub}/groups/{group}/:send`).
     */
    public SetGroupPublisher(publisher: AzureWebPubSubGroupPublisher | null): void {
        this._groupPublisher = publisher;
    }

    /**
     * Computes the Azure Web PubSub group names (`mj-role-<roleId>`) for a user's roles.
     */
    public GetAuthorizedGroupsForUser(user: UserInfo): string[] {
        const roles = user.UserRoles ?? [];
        const groups: string[] = [];
        for (const r of roles) {
            const roleId = (r.RoleID ?? '').trim().toLowerCase();
            if (roleId.length > 0) {
                groups.push(`mj-role-${roleId}`);
            }
        }
        groups.sort();
        return groups;
    }

    protected override async OnInvalidationRecorded(payload: CacheInvalidationPayload): Promise<void> {
        const hubName = this._config.azureWebPubSub?.hubName || 'mj_cache_hub';
        const entity = this.ResolveEntityForPayload(payload);
        if (!entity) {
            return;
        }

        // Group entity permissions by RoleID and shape once per authorized role
        for (const perm of entity.Permissions) {
            if (!perm.CanRead) continue;
            const roleId = (perm.RoleID ?? '').trim().toLowerCase();
            if (!roleId) continue;

            const syntheticRoleHolder = { UserRoles: [{ RoleID: roleId }] };
            const shaped = this.ShapeEventForSubscriber(payload, syntheticRoleHolder, entity);
            const message: AzureWebPubSubGroupMessage = {
                HubName: hubName,
                GroupName: `mj-role-${roleId}`,
                Event: shaped,
            };

            if (this._groupPublisher) {
                await this._groupPublisher(message);
            } else if (this._config.azureWebPubSub?.endpoint && this._config.azureWebPubSub?.accessKey) {
                await this.publishViaRestApi(message);
            }
        }
    }

    public override async NegotiateClientConnection(
        user: UserInfo,
        defaultGraphQLWsUrl = '/graphql'
    ): Promise<CacheBroadcastNegotiationResult> {
        const endpoint = (this._config.azureWebPubSub?.endpoint ?? '').replace(/\/+$/, '');
        const hubName = this._config.azureWebPubSub?.hubName || 'mj_cache_hub';
        const accessKey = this._config.azureWebPubSub?.accessKey || '';
        const ttlMinutes = this._config.azureWebPubSub?.tokenTtlMinutes ?? 60;
        const expiresAtMs = Date.now() + ttlMinutes * 60 * 1000;
        const groups = this.GetAuthorizedGroupsForUser(user);

        if (!endpoint) {
            return {
                Provider: this.Topology,
                Url: defaultGraphQLWsUrl,
                Groups: groups,
                ExpiresAt: new Date(expiresAtMs).toISOString(),
                ServerProcessID: this.ServerProcessID,
                CurrentSequence: this.CurrentSequence,
            };
        }

        const wsEndpoint = endpoint.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
        const audience = `${endpoint}/client/hubs/${hubName}`;
        const token = accessKey
            ? this.mintJwtToken(audience, user.ID, groups, Math.floor(expiresAtMs / 1000), accessKey)
            : undefined;
        const url = token
            ? `${wsEndpoint}/client/hubs/${hubName}?access_token=${encodeURIComponent(token)}`
            : `${wsEndpoint}/client/hubs/${hubName}`;

        return {
            Provider: this.Topology,
            Url: url,
            Token: token,
            Groups: groups,
            ExpiresAt: new Date(expiresAtMs).toISOString(),
            ServerProcessID: this.ServerProcessID,
            CurrentSequence: this.CurrentSequence,
        };
    }

    private mintJwtToken(
        audience: string,
        subject: string,
        groups: string[],
        expSeconds: number,
        secret: string
    ): string {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const claims = Buffer.from(
            JSON.stringify({
                aud: audience,
                sub: subject,
                iat: Math.floor(Date.now() / 1000),
                exp: expSeconds,
                role: groups.map((g) => `webpubsub.joinLeaveGroup.${g}`),
            })
        ).toString('base64url');
        const signingInput = `${header}.${claims}`;
        const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
        return `${signingInput}.${signature}`;
    }

    private async publishViaRestApi(message: AzureWebPubSubGroupMessage): Promise<void> {
        const endpoint = (this._config.azureWebPubSub?.endpoint ?? '').replace(/\/+$/, '');
        const accessKey = this._config.azureWebPubSub?.accessKey ?? '';
        if (!endpoint || !accessKey) return;

        const targetUrl = `${endpoint}/api/hubs/${encodeURIComponent(message.HubName)}/groups/${encodeURIComponent(message.GroupName)}/:send?api-version=2024-01-01`;
        const token = this.mintJwtToken(targetUrl, 'mj-server', [], Math.floor(Date.now() / 1000) + 300, accessKey);
        await fetch(targetUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message.Event),
        });
    }
}
