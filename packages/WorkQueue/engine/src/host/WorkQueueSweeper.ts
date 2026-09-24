import type { UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity } from '@memberjunction/core-entities';
import type { WorkLogger } from '@memberjunction/work-queue-core';
import type { WorkQueueExecutorSource } from '../sql/WorkQueueSqlExecutor';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';

export interface WorkQueueSweeperEngine {
    readonly Subscriptions: MJWorkQueueSubscriptionEntity[];
    NotifyDeadLettered(event: DeadLetteredEvent): void;
}

/** Placeholder with the final constructor shape (03 §11); plan 06 Task 4 supplies the implementation. */
export class WorkQueueSweeper {
    constructor(_executor: WorkQueueExecutorSource, _engine: WorkQueueSweeperEngine, _contextUser: UserInfo, _log: WorkLogger) {}

    public async RunOnce(): Promise<Record<string, number>> {
        return {};
    }
}
