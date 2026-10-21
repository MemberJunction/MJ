import type { UserInfo } from '@memberjunction/core';
import type { WorkLogger } from '@memberjunction/work-queue-core';
import type { WorkQueueExecutorSource } from '../sql/WorkQueueSqlExecutor';

/** A delivery an expire pass moved to DeadLettered (03 §11 alerting seam). */
export interface DeadLetteredEvent {
    SubscriptionName: string;
    DeliveryID: string;
    Reason: string;
    PartitionKey: string | null;
}

/** Everything a transport driver factory hands to the drivers it builds (03 §11). */
export interface TransportDriverDeps {
    ContextUser: UserInfo;
    Executor: WorkQueueExecutorSource;
    Log: WorkLogger;
    /** Lease owner identity for claims; defaults to host:pid:random. */
    InstanceID?: string;
    /** Alerting seam (03 §11): the engine passes a notifier that fans out to its OnDeadLettered listeners. */
    NotifyDeadLettered?: (event: DeadLetteredEvent) => void;
}
