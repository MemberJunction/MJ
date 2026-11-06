import { RegisterClass } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import {
    BaseCacheInvalidationBroadcastProvider,
    CacheBroadcastNegotiationResult,
    CacheInvalidationBroadcastManager,
    CacheInvalidationBroadcastTopology,
} from '../BaseCacheInvalidationBroadcastProvider.js';
import type { CacheInvalidationPayload } from '../../generic/CacheInvalidationResolver.js';

/**
 * Default MemberJunction cache invalidation broadcast provider (`'SequencedRoleBucket'`).
 *
 * Combines:
 * - **Topology 1 (Monotonic Sequence Ring Buffer + HTTP Header Piggybacking)**:
 *   Every mutation assigns a monotonic `Sequence` integer, stores the event in a bounded ring buffer,
 *   and piggybacks `X-MJ-Cache-Seq` and `X-MJ-Server-ID` onto GraphQL HTTP responses so clients can
 *   detect and recover missed invalidations via `GetCacheInvalidationsSince` in a single delta query.
 * - **Topology 2 (Role-Fingerprint $O(\text{Roles})$ Evaluation & Shaping Memoizer)**:
 *   Memoizes entity-level read permission (`CanRead`) and row-level security key-withholding
 *   (`ReadIsRowFiltered`) once per unique role fingerprint (`RoleID` set) per event instead of
 *   re-evaluating permissions $N$ times across all connected WebSocket clients.
 *
 * Zero external cloud infrastructure is required.
 */
@RegisterClass(BaseCacheInvalidationBroadcastProvider, 'SequencedRoleBucket')
export class SequencedRoleBucketBroadcastProvider extends BaseCacheInvalidationBroadcastProvider {
    public override get Topology(): CacheInvalidationBroadcastTopology {
        return 'SequencedRoleBucket';
    }

    protected override async OnInvalidationRecorded(_payload: CacheInvalidationPayload): Promise<void> {
        // In-process GraphQL WebSocket subscriptions read directly from PubSub + role-bucket memoizer;
        // no external cloud multiplexer dispatch is needed in SequencedRoleBucket mode.
    }

    public override async NegotiateClientConnection(
        user: UserInfo,
        defaultGraphQLWsUrl = '/graphql'
    ): Promise<CacheBroadcastNegotiationResult> {
        const fingerprint = this.GetRoleFingerprint(user);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        return {
            Provider: this.Topology,
            Url: defaultGraphQLWsUrl,
            Groups: [fingerprint],
            ExpiresAt: expiresAt,
            ServerProcessID: this.ServerProcessID,
            CurrentSequence: this.CurrentSequence,
        };
    }
}

// Ensure the default provider factory is always registered even if ClassFactory lookup happens early.
CacheInvalidationBroadcastManager.Instance.RegisterDefaultProviderFactory(
    () => new SequencedRoleBucketBroadcastProvider()
);
