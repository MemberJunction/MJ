import type { SubscriptionRow, TopicRow, TransportRow } from '../topology/rows';

/** Row fixtures shared by the base, engine and runtime suites. Reachable only through `@memberjunction/work-queue-base/testing`. */
export const TRANSPORT_ROW_FIXTURE: TransportRow = {
    ID: 'D1ED3F08-7008-4DA8-BA2B-7CD6A820AEB5', Name: 'Database', DriverClass: 'Database', Configuration: null, CredentialID: null, Status: 'Active',
};

export const TOPIC_ROW_FIXTURE: TopicRow = {
    ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'import.ready', TransportID: TRANSPORT_ROW_FIXTURE.ID,
    IsFifo: false, AllowExternalPublish: false, MaxPayloadBytes: 262144, DefaultDeduplicationTTLSeconds: 86400, RetentionDays: 7,
    BindingConfig: null, Status: 'Active',
};

export const SUBSCRIPTION_ROW_FIXTURE: SubscriptionRow = {
    ID: 'BBBBBBBB-0000-0000-0000-000000000001', TopicID: TOPIC_ROW_FIXTURE.ID, Name: 'venue-import', Filter: null, PartitionMode: 'Ordered',
    MaxAttempts: 5, BackoffBaseSeconds: 10, BackoffMaxSeconds: 900, LeaseSeconds: 60, HeartbeatMode: 'Auto', MaxProcessingSeconds: null,
    HostType: 'MJWorker', HandlerKey: 'VenueImport', ExternalRef: null, BindingConfig: null, Status: 'Active',
};
