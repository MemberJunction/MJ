import { BaseEngine } from '@memberjunction/core';
import type { BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { WORK_QUEUE_FILTER_SUPPORT, WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type {
    BindingValidationIssue, FilterSupport, SubscriptionBinding, SubscriptionFilter, SubscriptionPolicy,
    TopicBinding, TransportCapabilities,
} from '@memberjunction/work-queue-core';
import { WorkQueueEntityNames } from './constants';
import { FindByID, FindByName, ToSubscriptionBinding, ToSubscriptionPolicy, ToTopicBinding } from './topology/bindings';
import type { TopologySnapshot } from './topology/bindings';
import { ValidateTopologyRows } from './topology/validateTopology';

/**
 * Browser-safe metadata tier for the work queue (03 §11): the cached topology plus the pure derivations over it.
 * The server tier (`WorkQueueEngine` in @memberjunction/work-queue-engine) delegates to this instance; Explorer and
 * the operator dashboard use it directly, with no drivers, SQL or Node dependencies.
 */
export class WorkQueueEngineBase extends BaseEngine<WorkQueueEngineBase> {
    public static get Instance(): WorkQueueEngineBase {
        return super.getInstance<WorkQueueEngineBase>();
    }

    private _Transports: MJWorkQueueTransportEntity[] = [];
    private _Topics: MJWorkQueueTopicEntity[] = [];
    private _Subscriptions: MJWorkQueueSubscriptionEntity[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            { Type: 'entity', EntityName: WorkQueueEntityNames.Transports, PropertyName: '_Transports', CacheLocal: true },
            { Type: 'entity', EntityName: WorkQueueEntityNames.Topics, PropertyName: '_Topics', CacheLocal: true },
            { Type: 'entity', EntityName: WorkQueueEntityNames.Subscriptions, PropertyName: '_Subscriptions', CacheLocal: true },
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    public get Transports(): MJWorkQueueTransportEntity[] {
        return this.GetConfigData<MJWorkQueueTransportEntity>('_Transports');
    }

    public get Topics(): MJWorkQueueTopicEntity[] {
        return this.GetConfigData<MJWorkQueueTopicEntity>('_Topics');
    }

    public get Subscriptions(): MJWorkQueueSubscriptionEntity[] {
        return this.GetConfigData<MJWorkQueueSubscriptionEntity>('_Subscriptions');
    }

    /** The row view the pure topology helpers work over. */
    public get Snapshot(): TopologySnapshot {
        return { Transports: this.Transports, Topics: this.Topics, Subscriptions: this.Subscriptions };
    }

    /** Trimmed, case-insensitive. */
    public GetTopicByName(name: string): MJWorkQueueTopicEntity | undefined {
        return FindByName(this.Topics, name);
    }

    public GetSubscriptionByName(name: string): MJWorkQueueSubscriptionEntity | undefined {
        return FindByName(this.Subscriptions, name);
    }

    public SubscriptionsForTopic(topicID: string): MJWorkQueueSubscriptionEntity[] {
        return this.Subscriptions.filter(s => UUIDsEqual(s.TopicID, topicID));
    }

    public TopicOf(subscription: MJWorkQueueSubscriptionEntity): MJWorkQueueTopicEntity | undefined {
        return FindByID(this.Topics, subscription.TopicID);
    }

    public TransportOf(topic: MJWorkQueueTopicEntity): MJWorkQueueTransportEntity | undefined {
        return FindByID(this.Transports, topic.TransportID);
    }

    public BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding {
        return ToTopicBinding(topic);
    }

    public BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity,
                                    support: FilterSupport = WORK_QUEUE_FILTER_SUPPORT): SubscriptionBinding {
        return ToSubscriptionBinding(subscription, this.requireTopic(subscription), support);
    }

    public BuildSubscriptionPolicy(subscription: MJWorkQueueSubscriptionEntity): SubscriptionPolicy {
        return ToSubscriptionPolicy(subscription, this.requireTopic(subscription));
    }

    /** Parses the subscription's CompositeFilterDescriptor JSON against the transport's supported subset (03 §4). */
    public ParseFilter(subscription: MJWorkQueueSubscriptionEntity, support: FilterSupport): SubscriptionFilter | null {
        return this.BuildSubscriptionBinding(subscription, support).Filter;
    }

    /**
     * Validates the cached topology against capabilities supplied per `Transport.DriverClass` (03 §11). A browser
     * caller passes a static table; the server engine passes what its resolved drivers report.
     */
    public ValidateTopologyRows(capabilitiesByDriverClass: Record<string, TransportCapabilities>): BindingValidationIssue[] {
        return ValidateTopologyRows(this.Snapshot, capabilitiesByDriverClass);
    }

    private requireTopic(subscription: MJWorkQueueSubscriptionEntity): MJWorkQueueTopicEntity {
        const topic = this.TopicOf(subscription);
        if (!topic) {
            throw new WorkQueueConfigurationError(`Subscription '${subscription.Name}' references a topic that does not exist`);
        }
        return topic;
    }
}
