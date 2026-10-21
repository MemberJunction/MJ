import type { HeartbeatMode, HostType, PartitionMode } from '@memberjunction/work-queue-core';

/** Structural views of the topology entities. The generated entity classes satisfy them directly. */
export interface TransportRow {
    ID: string;
    Name: string;
    DriverClass: string;
    Configuration: string | null;
    CredentialID: string | null;
    Status: 'Active' | 'Disabled';
}

export interface TopicRow {
    ID: string;
    Name: string;
    TransportID: string;
    IsFifo: boolean;
    AllowExternalPublish: boolean;
    MaxPayloadBytes: number;
    DefaultDeduplicationTTLSeconds: number;
    RetentionDays: number;
    BindingConfig: string | null;
    Status: 'Active' | 'Disabled';
}

export interface SubscriptionRow {
    ID: string;
    TopicID: string;
    Name: string;
    Filter: string | null;
    PartitionMode: PartitionMode;
    MaxAttempts: number;
    BackoffBaseSeconds: number;
    BackoffMaxSeconds: number;
    LeaseSeconds: number;
    HeartbeatMode: HeartbeatMode;
    MaxProcessingSeconds: number | null;
    HostType: HostType;
    HandlerKey: string | null;
    ExternalRef: string | null;
    BindingConfig: string | null;
    Status: 'Active' | 'Paused' | 'Disabled';
}
