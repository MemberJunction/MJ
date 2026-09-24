import { UUIDsEqual } from '@memberjunction/global';
import { ParseSubscriptionFilter, WORK_QUEUE_FILTER_SUPPORT, WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { BindingImport, BindingValidationIssue, ManifestSubscription, TopologyManifest } from '@memberjunction/work-queue-core';
import { ParseJsonObject } from '../entities/validation';
import { FindByName, ToSubscriptionPolicy } from './bindings';
import type { TopologySnapshot } from './bindings';
import type { SubscriptionRow, TopicRow } from './rows';

export interface BindingUpdate {
    ID: string;
    Name: string;
    BindingConfig: string;
}

export interface BindingImportPlan {
    TopicUpdates: BindingUpdate[];
    SubscriptionUpdates: BindingUpdate[];
    Issues: BindingValidationIssue[];
}

/**
 * Exports one transport's active topics and non-disabled subscriptions (03 §10), sorted by name for stable diffs.
 * Transport-neutral: it never renders a broker-specific field. `ManifestSubscription.DriverArtifacts` (CD8) is added
 * by the transport's driver at export time (the engine's ExportManifest, Task 12).
 */
export function BuildTopologyManifest(snapshot: TopologySnapshot, transportName: string, generatedAt: Date): TopologyManifest {
    const transport = FindByName(snapshot.Transports, transportName);
    if (!transport) {
        throw new WorkQueueConfigurationError(`Transport '${transportName}' does not exist`);
    }
    const topics = snapshot.Topics
        .filter(t => UUIDsEqual(t.TransportID, transport.ID) && t.Status === 'Active')
        .sort((a, b) => a.Name.localeCompare(b.Name))
        .map(topic => ({
            Name: topic.Name,
            IsFifo: topic.IsFifo,
            MaxPayloadBytes: topic.MaxPayloadBytes,
            Subscriptions: snapshot.Subscriptions
                .filter(s => UUIDsEqual(s.TopicID, topic.ID) && s.Status !== 'Disabled')
                .sort((a, b) => a.Name.localeCompare(b.Name))
                .map(s => ToManifestSubscription(s, topic)),
        }));
    return {
        ManifestVersion: 1,
        GeneratedAt: generatedAt.toISOString(),
        Transport: {
            Name: transport.Name,
            DriverClass: transport.DriverClass,
            Configuration: ParseJsonObject(transport.Configuration, `Transport ${transport.Name} Configuration`),
        },
        Topics: topics,
    };
}

function ToManifestSubscription(subscription: SubscriptionRow, topic: TopicRow): ManifestSubscription {
    return {
        Name: subscription.Name,
        Filter: ParseSubscriptionFilter(subscription.Filter, WORK_QUEUE_FILTER_SUPPORT),
        Policy: ToSubscriptionPolicy(subscription, topic),
        HostType: subscription.HostType,
        // Terraform maps Paused to the Lambda event source's `enabled = false` (03 §10). Disabled rows are not exported.
        Status: subscription.Status,
        ExternalRef: subscription.ExternalRef,
    };
}

/** Turns `terraform output` bindings into entity updates; unknown names become issues. */
export function PlanBindingImport(snapshot: TopologySnapshot, bindings: BindingImport): BindingImportPlan {
    const plan: BindingImportPlan = { TopicUpdates: [], SubscriptionUpdates: [], Issues: [] };
    if (bindings.ManifestVersion !== 1) {
        plan.Issues.push({ Severity: 'Error', Subject: 'BindingImport', Message: `Unsupported ManifestVersion ${String(bindings.ManifestVersion)}` });
        return plan;
    }
    for (const entry of bindings.Topics) {
        const topic = FindByName(snapshot.Topics, entry.Name);
        if (topic) {
            plan.TopicUpdates.push({ ID: topic.ID, Name: topic.Name, BindingConfig: JSON.stringify(entry.BindingConfig) });
        } else {
            plan.Issues.push({ Severity: 'Error', Subject: entry.Name, Message: `No topic named ${entry.Name} exists` });
        }
    }
    for (const entry of bindings.Subscriptions) {
        const subscription = FindByName(snapshot.Subscriptions, entry.Name);
        if (subscription) {
            plan.SubscriptionUpdates.push({ ID: subscription.ID, Name: subscription.Name, BindingConfig: JSON.stringify(entry.BindingConfig) });
        } else {
            plan.Issues.push({ Severity: 'Error', Subject: entry.Name, Message: `No subscription named ${entry.Name} exists` });
        }
    }
    return plan;
}
