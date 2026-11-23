import type { PublishRequest, PublishResult, WorkJson } from '@memberjunction/work-queue-core';
import {
    WorkQueuePublishCoordinator,
    type CoordinatorPublishOptions,
    type PublishCoordinatorDeps,
} from '../publish/WorkQueuePublishCoordinator';

/**
 * Convenience coordinator wrapper scoped to GCP Pub/Sub publish workflows.
 * Delegates deduplication, validation, ordering-key assignment, and batching to `WorkQueuePublishCoordinator`.
 */
export class GcpPublishCoordinator {
    private readonly coordinator: WorkQueuePublishCoordinator;

    constructor(deps: PublishCoordinatorDeps) {
        this.coordinator = new WorkQueuePublishCoordinator(deps);
    }

    public Publish<TPayload extends WorkJson = WorkJson>(
        topicName: string,
        requests: PublishRequest<TPayload>[],
        options: CoordinatorPublishOptions,
    ): Promise<PublishResult[]> {
        return this.coordinator.Publish(topicName, requests, options);
    }
}
