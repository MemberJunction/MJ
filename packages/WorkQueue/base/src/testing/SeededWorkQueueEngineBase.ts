import type { UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import type { TopologySnapshot } from '../topology/bindings';
import { WorkQueueEngineBase } from '../WorkQueueEngineBase';

/**
 * TEST ONLY. Serves seeded rows instead of loading entities. The row fixtures are structural stand-ins for the
 * generated entities — every derivation in WorkQueueEngineBase reads row fields only — which is why the three getters
 * carry the one cast in this package.
 */
export class SeededWorkQueueEngineBase extends WorkQueueEngineBase {
    public static override get Instance(): SeededWorkQueueEngineBase {
        return super.getInstance<SeededWorkQueueEngineBase>();
    }

    private seeded: TopologySnapshot = { Transports: [], Topics: [], Subscriptions: [] };
    private seededUser: UserInfo | null = null;

    public Seed(snapshot: TopologySnapshot, contextUser: UserInfo): void {
        this.seeded = snapshot;
        this.seededUser = contextUser;
    }

    public override async Config(): Promise<void> {
        // Nothing to load: Seed() is the data source.
    }

    public override get Loaded(): boolean {
        return true;
    }

    public override get ContextUser(): UserInfo {
        if (!this.seededUser) {
            throw new Error('SeededWorkQueueEngineBase.Seed() has not been called');
        }
        return this.seededUser;
    }

    public override get Transports(): MJWorkQueueTransportEntity[] {
        return this.seeded.Transports as unknown as MJWorkQueueTransportEntity[];
    }

    public override get Topics(): MJWorkQueueTopicEntity[] {
        return this.seeded.Topics as unknown as MJWorkQueueTopicEntity[];
    }

    public override get Subscriptions(): MJWorkQueueSubscriptionEntity[] {
        return this.seeded.Subscriptions as unknown as MJWorkQueueSubscriptionEntity[];
    }
}
