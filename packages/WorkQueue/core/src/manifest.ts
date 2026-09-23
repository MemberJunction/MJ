import type { WorkJson } from './envelope';
import type { SubscriptionFilter } from './filterTypes';
import type { HostType, SubscriptionPolicy } from './policy';

export interface TopologyManifest {
    ManifestVersion: 1;
    GeneratedAt: string;
    Transport: { Name: string; DriverClass: string; Configuration: Record<string, WorkJson> };
    Topics: ManifestTopic[];
}

export interface ManifestTopic {
    Name: string;
    IsFifo: boolean;
    MaxPayloadBytes: number;
    Subscriptions: ManifestSubscription[];
}

export interface ManifestSubscription {
    Name: string;
    Filter: SubscriptionFilter | null;
    Policy: SubscriptionPolicy;
    HostType: HostType;
    /** Terraform maps Paused/Disabled to the Lambda event source's `enabled = false`. */
    Status: 'Active' | 'Paused' | 'Disabled';
    ExternalRef: string | null;
    /**
     * Artifacts rendered by the transport's driver at export time (for example the subscription filter in the
     * broker's native syntax) so IaC never re-translates them. Core defines the slot; each driver defines and
     * documents its keys (AWS: `SnsFilterPolicy`). Absent on transports that render nothing (contract delta CD8).
     */
    DriverArtifacts?: Record<string, WorkJson>;
}

export interface BindingImport {
    ManifestVersion: 1;
    Topics: { Name: string; BindingConfig: Record<string, WorkJson> }[];
    Subscriptions: { Name: string; BindingConfig: Record<string, WorkJson> }[];
}
