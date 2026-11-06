import { describe, it, expect } from 'vitest';
import * as Core from '../index';
import * as Testing from '../testing';
import * as TestingVitest from '../testing/vitest';

describe('public API', () => {
    it('exposes the runtime, validation, transports and client from the main entry', () => {
        const names = [
            'ValidatePublishRequest',
            'BuildWorkMessage',
            'SerializedEnvelopeBytes',
            'CanonicalEnvelope',
            'ParseSubscriptionFilter',
            'ValidateSubscriptionFilter',
            'MatchesFilter',
            'FilterFields',
            'WORK_QUEUE_FILTER_SUPPORT',
            'ComputeBackoffSeconds',
            'HeartbeatIntervalSeconds',
            'SubscriptionUnsupportedReason',
            'ConsumerRuntime',
            'DeliveryExecution',
            'ExecutionKeyOf',
            'InMemoryTransport',
            'WorkQueueApiPublisher',
            'ParseRestPublishBody',
            'Outcome',
            'FatalWorkError',
            'TransientWorkError',
            'WorkQueueConfigurationError',
            'PublishErrorCodes',
        ];
        for (const name of names) {
            expect(Object.prototype.hasOwnProperty.call(Core, name), name).toBe(true);
        }
    });

    it('keeps the conformance kit out of the main entry', () => {
        // Removed in Revision 4 (spec 11): these must not reappear.
        for (const removed of ['SEQUENCE_ALREADY_RESOLVED_NOTE', 'SKIPPED_AFTER_PARTITION_FAILURE']) {
            expect(Object.prototype.hasOwnProperty.call(Core, removed), removed).toBe(false);
        }
        expect(Object.prototype.hasOwnProperty.call(Core, 'RunConformanceChecks')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(Core, 'RunTransportConformanceSuite')).toBe(false);
    });

    it('exposes the runner-agnostic kit from ./testing without the vitest wrapper', () => {
        for (const name of ['RunConformanceChecks', 'CONFORMANCE_CASES', 'ConformanceAssertionError', 'BuildSubscriptionBinding', 'ManualClock']) {
            expect(Object.prototype.hasOwnProperty.call(Testing, name), name).toBe(true);
        }
        expect(Object.prototype.hasOwnProperty.call(Testing, 'RunTransportConformanceSuite')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(TestingVitest, 'RunTransportConformanceSuite')).toBe(true);
    });
});
