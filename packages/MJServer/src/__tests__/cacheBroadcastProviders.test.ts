import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EntityInfo, UserInfo } from '@memberjunction/core';
import type { PubSubEngine } from 'type-graphql';
import {
    AzureWebPubSubBroadcastProvider,
    AWSIoTCoreBroadcastProvider,
    CacheInvalidationBroadcastManager,
    GCPPubSubBroadcastProvider,
    SequencedRoleBucketBroadcastProvider,
    type AzureWebPubSubGroupMessage,
    type AWSIoTCoreTopicMessage,
    type GCPPubSubTopicMessage,
} from '../broadcast/index.js';
import type { CacheInvalidationPayload } from '../generic/CacheInvalidationResolver.js';
import {
    GetSessionStatusTopic,
    PUSH_STATUS_UPDATES_TOPIC,
    ParseStatusUpdateMessage,
    PublishStatusUpdate,
    ShouldReplicateStatusUpdate,
    type PushStatusNotificationPayload,
} from '../generic/PushStatusResolver.js';
import { CreateSessionRoutingPubSub, PubSubManager } from '../generic/PubSubManager.js';
import {
    ResolveServerRole,
    ShouldRunBackgroundWorkers,
    ShouldServeInteractiveTraffic,
} from '../serverRoleConfigUnits.js';

function makeUser(id: string, roleIds: string[]): UserInfo {
    return {
        ID: id,
        Name: `User ${id}`,
        Email: `${id}@example.com`,
        UserRoles: roleIds.map((r) => ({ UserID: id, RoleID: r, RoleName: r })),
    } as unknown as UserInfo;
}

function makePayload(overrides: Partial<CacheInvalidationPayload> = {}): CacheInvalidationPayload {
    return {
        entityName: 'Invoices',
        primaryKeyValues: '[{"FieldName":"ID","Value":"inv-1"}]',
        action: 'save',
        sourceServerId: 'srv-1',
        timestamp: new Date('2026-10-20T12:00:00Z'),
        recordData: '{"ID":"inv-1","Total":500}',
        ...overrides,
    };
}

describe('CacheInvalidationBroadcastManager & SequencedRoleBucketBroadcastProvider (Topologies 1 & 2)', () => {
    let provider: SequencedRoleBucketBroadcastProvider;

    beforeEach(() => {
        provider = CacheInvalidationBroadcastManager.Instance.Configure({
            provider: 'SequencedRoleBucket',
            ringBufferSize: 5,
            excludedEntities: ['MJ: Audit Logs'],
        }) as SequencedRoleBucketBroadcastProvider;
        provider.ResetStateForTesting();
    });

    it('defaults to SequencedRoleBucket and stamps monotonically increasing sequences', () => {
        expect(provider.Topology).toBe('SequencedRoleBucket');
        expect(provider.CurrentSequence).toBe(0);

        const p1 = provider.RecordInvalidation(makePayload({ primaryKeyValues: 'pk-1' }));
        const p2 = provider.RecordInvalidation(makePayload({ primaryKeyValues: 'pk-2' }));

        expect(p1.sequence).toBe(1);
        expect(p2.sequence).toBe(2);
        expect(provider.CurrentSequence).toBe(2);
        expect(provider.BufferedEventCount).toBe(2);
    });

    it('suppresses excluded high-churn entities from sequencing and broadcast', () => {
        expect(provider.ShouldBroadcastEntity('MJ: Audit Logs')).toBe(false);
        expect(provider.ShouldBroadcastEntity('Invoices')).toBe(true);

        const ignored = provider.RecordInvalidation(makePayload({ entityName: 'MJ: Audit Logs' }));
        expect(ignored.sequence).toBeUndefined();
        expect(provider.CurrentSequence).toBe(0);
    });

    it('computes canonical, order-independent role fingerprints and memoizes per user object', () => {
        const u1 = makeUser('u1', ['Role-B', 'role-a']);
        const u2 = makeUser('u2', ['ROLE-A', '  role-b ']);

        const fp1 = provider.GetRoleFingerprint(u1);
        const fp2 = provider.GetRoleFingerprint(u2);

        expect(fp1).toBe('roles:role-a|role-b');
        expect(fp2).toBe('roles:role-a|role-b');
        // Second call hits WeakMap cache
        expect(provider.GetRoleFingerprint(u1)).toBe(fp1);
    });

    it('coalesces permission & RLS evaluation to O(Roles) instead of O(Subscribers)', () => {
        const getUserPermisionsSpy = vi.fn((user: UserInfo) => {
            const hasDeniedOnly = user.UserRoles.every((r) => r.RoleID === 'role-none');
            return { CanRead: !hasDeniedOnly };
        });

        const fakeEntity = {
            Name: 'Invoices',
            GetUserPermisions: getUserPermisionsSpy,
            Permissions: [
                { RoleID: 'role-open', CanRead: true, Type: 'Allow', ReadRLSFilterID: null },
                { RoleID: 'role-rls', CanRead: true, Type: 'Allow', ReadRLSFilterID: 'rls-filter-1' },
                { RoleID: 'role-none', CanRead: false, Type: 'Allow', ReadRLSFilterID: null },
            ],
        } as unknown as EntityInfo;

        vi.spyOn(provider, 'ResolveEntityForPayload').mockReturnValue(fakeEntity);
        const rlsSpy = vi.spyOn(provider, 'ReadIsRowFiltered');

        const payload = makePayload();

        // Create 300 subscribers across only 3 distinct role buckets (100 per bucket)
        const openUsers = Array.from({ length: 100 }, (_, i) => makeUser(`open-${i}`, ['role-open']));
        const rlsUsers = Array.from({ length: 100 }, (_, i) => makeUser(`rls-${i}`, ['role-rls']));
        const deniedUsers = Array.from({ length: 100 }, (_, i) => makeUser(`denied-${i}`, ['role-none']));

        for (const u of openUsers) {
            expect(provider.EvaluateEntityReadAccess(payload, u)).toBe(true);
            const shaped = provider.ShapeEventForSubscriber(payload, u, fakeEntity);
            expect(shaped.PrimaryKeyValues).toBe(payload.primaryKeyValues);
            expect(shaped.RecordData).toBe(payload.recordData);
        }

        for (const u of rlsUsers) {
            expect(provider.EvaluateEntityReadAccess(payload, u)).toBe(true);
            const shaped = provider.ShapeEventForSubscriber(payload, u, fakeEntity);
            expect(shaped.PrimaryKeyValues).toBeUndefined();
            expect(shaped.RecordData).toBeUndefined();
        }

        for (const u of deniedUsers) {
            expect(provider.EvaluateEntityReadAccess(payload, u)).toBe(false);
        }

        // Despite 300 subscribers, GetUserPermisions ran only 3 times (once per unique role bucket)
        // and ReadIsRowFiltered ran only 2 times (for the 2 allowed role buckets)!
        expect(getUserPermisionsSpy).toHaveBeenCalledTimes(3);
        expect(rlsSpy).toHaveBeenCalledTimes(2);
    });

    it('serves delta catch-up from the circular ring buffer and coalesces duplicate PK updates', () => {
        const fakeEntity = {
            Name: 'Invoices',
            GetUserPermisions: () => ({ CanRead: true }),
            Permissions: [{ RoleID: 'role-open', CanRead: true, Type: 'Allow', ReadRLSFilterID: null }],
        } as unknown as EntityInfo;
        vi.spyOn(provider, 'ResolveEntityForPayload').mockReturnValue(fakeEntity);

        const user = makeUser('u1', ['role-open']);

        // Record 4 events (two on inv-1, one on inv-2, one on inv-1 again)
        provider.RecordInvalidation(makePayload({ primaryKeyValues: 'inv-1', recordData: '{"v":1}' })); // seq 1
        provider.RecordInvalidation(makePayload({ primaryKeyValues: 'inv-2', recordData: '{"v":2}' })); // seq 2
        provider.RecordInvalidation(makePayload({ primaryKeyValues: 'inv-1', recordData: '{"v":3}' })); // seq 3

        const catchUp = provider.GetChangesSince(0, user);
        expect(catchUp.RequiresFullRefresh).toBe(false);
        expect(catchUp.CurrentSequence).toBe(3);
        // inv-1 (seq 1 and seq 3) coalesced to latest (seq 3), so 2 events total
        expect(catchUp.Events).toHaveLength(2);
        const inv1Event = catchUp.Events.find((e) => e.PrimaryKeyValues === 'inv-1');
        expect(inv1Event?.RecordData).toBe('{"v":3}');
        expect(inv1Event?.Sequence).toBe(3);
    });

    it('signals RequiresFullRefresh when sinceSequence has been evicted from the circular ring buffer', () => {
        const fakeEntity = {
            Name: 'Invoices',
            GetUserPermisions: () => ({ CanRead: true }),
            Permissions: [{ RoleID: 'role-open', CanRead: true, Type: 'Allow', ReadRLSFilterID: null }],
        } as unknown as EntityInfo;
        vi.spyOn(provider, 'ResolveEntityForPayload').mockReturnValue(fakeEntity);

        const user = makeUser('u1', ['role-open']);

        // Ring buffer size is 5; push 7 events so sequences 1 and 2 are overwritten (oldest in buffer is 3)
        for (let i = 1; i <= 7; i++) {
            provider.RecordInvalidation(makePayload({ primaryKeyValues: `inv-${i}` }));
        }

        // Requesting sinceSequence = 1 (missed seq 2, which was evicted) -> RequiresFullRefresh: true
        const evictedCatchUp = provider.GetChangesSince(1, user);
        expect(evictedCatchUp.RequiresFullRefresh).toBe(true);
        expect(evictedCatchUp.Events).toHaveLength(0);

        // Requesting sinceSequence = 2 (oldest needed is seq 3, still in buffer) -> RequiresFullRefresh: false
        const validCatchUp = provider.GetChangesSince(2, user);
        expect(validCatchUp.RequiresFullRefresh).toBe(false);
        expect(validCatchUp.Events).toHaveLength(5);
    });
});

describe('Topology 3 Cloud Multiplexer Providers (AzureWebPubSub, AWSIoTCore, GCPPubSub)', () => {
    afterEach(() => {
        CacheInvalidationBroadcastManager.Instance.Configure({ provider: 'SequencedRoleBucket' });
    });

    it('AzureWebPubSubBroadcastProvider negotiates signed JWT URLs and publishes role-shaped group messages', async () => {
        const azureProvider = CacheInvalidationBroadcastManager.Instance.Configure({
            provider: 'AzureWebPubSub',
            azureWebPubSub: {
                endpoint: 'https://mj-test.webpubsub.azure.com',
                hubName: 'mj_hub',
                accessKey: 'test-secret-access-key-123456',
                tokenTtlMinutes: 30,
            },
        }) as AzureWebPubSubBroadcastProvider;

        expect(azureProvider).toBeInstanceOf(AzureWebPubSubBroadcastProvider);
        expect(azureProvider.Topology).toBe('AzureWebPubSub');

        const user = makeUser('u-azure', ['Role-Admin', 'Role-Finance']);
        const negotiated = await azureProvider.NegotiateClientConnection(user);
        expect(negotiated.Provider).toBe('AzureWebPubSub');
        expect(negotiated.Url).toContain('wss://mj-test.webpubsub.azure.com/client/hubs/mj_hub?access_token=');
        expect(negotiated.Token).toBeDefined();
        expect(negotiated.Groups).toEqual(['mj-role-role-admin', 'mj-role-role-finance']);

        const published: AzureWebPubSubGroupMessage[] = [];
        azureProvider.SetGroupPublisher(async (msg) => {
            published.push(msg);
        });

        const fakeEntity = {
            Name: 'Invoices',
            GetUserPermisions: () => ({ CanRead: true }),
            Permissions: [
                { RoleID: 'role-admin', CanRead: true, Type: 'Allow', ReadRLSFilterID: null },
                { RoleID: 'role-rls', CanRead: true, Type: 'Allow', ReadRLSFilterID: 'rls-1' },
            ],
        } as unknown as EntityInfo;
        vi.spyOn(azureProvider, 'ResolveEntityForPayload').mockReturnValue(fakeEntity);

        azureProvider.RecordInvalidation(makePayload());
        await new Promise((r) => setTimeout(r, 10));

        expect(published).toHaveLength(2);
        const adminMsg = published.find((m) => m.GroupName === 'mj-role-role-admin');
        const rlsMsg = published.find((m) => m.GroupName === 'mj-role-role-rls');
        expect(adminMsg?.Event.PrimaryKeyValues).toBeDefined();
        expect(rlsMsg?.Event.PrimaryKeyValues).toBeUndefined();
    });

    it('AWSIoTCoreBroadcastProvider negotiates SigV4 presigned MQTT URLs and publishes role topics', async () => {
        const awsProvider = CacheInvalidationBroadcastManager.Instance.Configure({
            provider: 'AWSIoTCore',
            awsIoTCore: {
                endpoint: 'a1b2c3-ats.iot.us-east-1.amazonaws.com',
                region: 'us-east-1',
                topicPrefix: 'mj/prod/cache',
                accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
            },
        }) as AWSIoTCoreBroadcastProvider;

        expect(awsProvider).toBeInstanceOf(AWSIoTCoreBroadcastProvider);
        const user = makeUser('u-aws', ['role-ops']);
        const negotiated = await awsProvider.NegotiateClientConnection(user);
        expect(negotiated.Provider).toBe('AWSIoTCore');
        expect(negotiated.Url).toContain('wss://a1b2c3-ats.iot.us-east-1.amazonaws.com/mqtt?X-Amz-Algorithm=AWS4-HMAC-SHA256');
        expect(negotiated.Groups).toEqual(['mj/prod/cache/roles/role-ops']);

        const published: AWSIoTCoreTopicMessage[] = [];
        awsProvider.SetTopicPublisher(async (msg) => {
            published.push(msg);
        });
        const fakeEntity = {
            Name: 'Invoices',
            GetUserPermisions: () => ({ CanRead: true }),
            Permissions: [{ RoleID: 'role-ops', CanRead: true, Type: 'Allow', ReadRLSFilterID: null }],
        } as unknown as EntityInfo;
        vi.spyOn(awsProvider, 'ResolveEntityForPayload').mockReturnValue(fakeEntity);

        awsProvider.RecordInvalidation(makePayload());
        await new Promise((r) => setTimeout(r, 10));
        expect(published).toHaveLength(1);
        expect(published[0].Topic).toBe('mj/prod/cache/roles/role-ops');
    });

    it('GCPPubSubBroadcastProvider negotiates gateway tokens and publishes Pub/Sub topic messages', async () => {
        const gcpProvider = CacheInvalidationBroadcastManager.Instance.Configure({
            provider: 'GCPPubSub',
            gcpPubSub: {
                projectId: 'mj-cloud-prod',
                topicPrefix: 'mj-invalidation',
                gatewayUrl: 'https://cache-gw.run.app/ws',
                signingSecret: 'gcp-gateway-secret-key',
            },
        }) as GCPPubSubBroadcastProvider;

        expect(gcpProvider).toBeInstanceOf(GCPPubSubBroadcastProvider);
        const user = makeUser('u-gcp', ['role-analyst']);
        const negotiated = await gcpProvider.NegotiateClientConnection(user);
        expect(negotiated.Provider).toBe('GCPPubSub');
        expect(negotiated.Url).toContain('wss://cache-gw.run.app/ws?token=');
        expect(negotiated.Groups).toEqual(['projects/mj-cloud-prod/topics/mj-invalidation-role-role-analyst']);

        const published: GCPPubSubTopicMessage[] = [];
        gcpProvider.SetTopicPublisher(async (msg) => {
            published.push(msg);
        });
        const fakeEntity = {
            Name: 'Invoices',
            GetUserPermisions: () => ({ CanRead: true }),
            Permissions: [{ RoleID: 'role-analyst', CanRead: true, Type: 'Allow', ReadRLSFilterID: null }],
        } as unknown as EntityInfo;
        vi.spyOn(gcpProvider, 'ResolveEntityForPayload').mockReturnValue(fakeEntity);

        gcpProvider.RecordInvalidation(makePayload());
        await new Promise((r) => setTimeout(r, 10));
        expect(published).toHaveLength(1);
        expect(published[0].TopicName).toBe('projects/mj-cloud-prod/topics/mj-invalidation-role-role-analyst');
    });
});

describe('PushStatusResolver O(1) session routing and WeakMap JSON memoization', () => {
    it('routes session-specific updates to PUSH_STATUS_UPDATES:session:<id> and wildcard updates to PUSH_STATUS_UPDATES', async () => {
        const rawPublish = vi.fn(async () => undefined);
        const rawPubSub: PubSubEngine = {
            publish: rawPublish,
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
            asyncIterator: vi.fn(),
        } as unknown as PubSubEngine;

        PubSubManager.Instance.SetPubSubEngine(rawPubSub);
        const routedPubSub = PubSubManager.Instance.PubSubEngine!;

        PublishStatusUpdate(routedPubSub, {
            sessionId: 'tab-abc',
            ownerUserId: 'user-1',
            message: '{"type":"Progress"}',
        });

        PublishStatusUpdate(routedPubSub, {
            sessionId: '*',
            ownerUserId: 'user-1',
            message: '{"type":"Broadcast"}',
        });

        expect(rawPublish).toHaveBeenCalledTimes(2);
        expect(rawPublish).toHaveBeenNthCalledWith(
            1,
            GetSessionStatusTopic('tab-abc'),
            expect.objectContaining({ sessionId: 'tab-abc' })
        );
        expect(rawPublish).toHaveBeenNthCalledWith(
            2,
            PUSH_STATUS_UPDATES_TOPIC,
            expect.objectContaining({ sessionId: '*' })
        );
    });

    it('memoizes JSON.parse per PushStatusNotificationPayload object via WeakMap', () => {
        const payload: PushStatusNotificationPayload = {
            sessionId: 'tab-1',
            ownerUserId: 'u-1',
            message: JSON.stringify({ type: 'StreamingContent', step: 1 }),
        };

        const parseSpy = vi.spyOn(JSON, 'parse');
        try {
            const first = ParseStatusUpdateMessage(payload);
            const second = ParseStatusUpdateMessage(payload);
            const shouldReplicate = ShouldReplicateStatusUpdate(payload.message, payload);

            expect(first).toBe(second);
            expect(shouldReplicate).toBe(false);
            expect(parseSpy).toHaveBeenCalledTimes(1);
        } finally {
            parseSpy.mockRestore();
        }
    });
});

describe('ServerRole configuration units (Pillar 4)', () => {
    it('resolves all, api, and worker roles case-insensitively and defaults to all', () => {
        expect(ResolveServerRole(undefined)).toBe('all');
        expect(ResolveServerRole('')).toBe('all');
        expect(ResolveServerRole('  API ')).toBe('api');
        expect(ResolveServerRole('WORKER')).toBe('worker');
        expect(ResolveServerRole('all')).toBe('all');
        expect(() => ResolveServerRole('invalid-role')).toThrow(/Invalid MJ_SERVER_ROLE/);
    });

    it('correctly gates background workers and interactive traffic by role', () => {
        expect(ShouldRunBackgroundWorkers('all')).toBe(true);
        expect(ShouldRunBackgroundWorkers('worker')).toBe(true);
        expect(ShouldRunBackgroundWorkers('api')).toBe(false);

        expect(ShouldServeInteractiveTraffic('all')).toBe(true);
        expect(ShouldServeInteractiveTraffic('api')).toBe(true);
        expect(ShouldServeInteractiveTraffic('worker')).toBe(false);
    });
});
