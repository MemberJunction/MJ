import type { WorkQueueSubscriptionStatsRow } from '@memberjunction/core-entities';

/** A subscription as the tab components pick and display it (topology from WorkQueueEngineBase). */
export interface WorkQueueSubscriptionOption {
    ID: string;
    Name: string;
    Topic: string;
    Transport: string;
    DriverClass: string;
    PartitionMode: string;
    Status: string;
}

export interface WorkQueueTransportOption {
    ID: string;
    Name: string;
    DriverClass: string;
    Status: string;
}

/** One line of the Overview table: topology joined with the latest stats read for it. */
export interface WorkQueueOverviewRow {
    TransportID: string;
    Transport: string;
    DriverClass: string;
    TopicID: string;
    Topic: string;
    IsFifo: boolean;
    SubscriptionID: string;
    Subscription: string;
    PartitionMode: string;
    Status: string;
    HostType: string;
    HandlerKey: string | null;
    Stats: WorkQueueSubscriptionStatsRow | null;
    /** The stats failure the operation reported for this subscription, if any. */
    Error: string | null;
}

export interface WorkQueueRecordOpenRequest {
    EntityName: 'MJ: Work Queue Topics' | 'MJ: Work Queue Subscriptions' | 'MJ: Work Queue Transports';
    ID: string;
}
