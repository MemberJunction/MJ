import { RegisterLegacyQueueBridge } from './register';

export * from './LegacyQueueTopicName';
export * from './LegacyQueueTaskPayload';
export * from './WorkQueueLegacyRouter';
export * from './LegacyQueueDriverHandler';
export * from './register';

// Importing this package is the opt-in: the router registers with @memberjunction/queue's seam and
// LegacyQueueDriverHandler registers with the ClassFactory through its decorator.
RegisterLegacyQueueBridge();
