import { UUIDsEqual } from '@memberjunction/global';
import { SubscriptionUnsupportedReason } from '@memberjunction/work-queue-core';
import type { BindingValidationIssue, HostType, TransportCapabilities } from '@memberjunction/work-queue-core';
import { DATABASE_DRIVER_CLASS } from '../constants';
import { FindByID, ToSubscriptionBinding, ToTopicBinding } from './bindings';
import type { TopologySnapshot } from './bindings';
import type { SubscriptionRow, TopicRow, TransportRow } from './rows';

/** Known maximum handler run time per host type (null = no known ceiling). External = AWS Lambda's 900 s. */
export const KNOWN_HOST_CEILING_SECONDS: Record<HostType, number | null> = {
    MJWorker: null,
    External: 900,
};

/**
 * Validates topology rows against transport capabilities, keyed by `Transport.DriverClass` (03 §11). Capabilities are
 * a property of the driver class, not of one transport row, so the browser tier can validate with a static table.
 */
export function ValidateTopologyRows(snapshot: TopologySnapshot, capabilitiesByDriverClass: Record<string, TransportCapabilities>): BindingValidationIssue[] {
    const issues: BindingValidationIssue[] = [];
    for (const topic of snapshot.Topics.filter(t => t.Status === 'Active')) {
        issues.push(...ValidateTopic(snapshot, topic, capabilitiesByDriverClass));
    }
    return issues;
}

function ValidateTopic(snapshot: TopologySnapshot, topic: TopicRow, capabilitiesByDriverClass: Record<string, TransportCapabilities>): BindingValidationIssue[] {
    const transport = FindByID(snapshot.Transports, topic.TransportID);
    if (!transport) {
        return [Issue('Error', topic.Name, 'Topic references a transport that does not exist')];
    }
    const issues: BindingValidationIssue[] = [];
    if (transport.Status === 'Disabled') {
        issues.push(Issue('Warning', topic.Name, `Transport '${transport.Name}' is disabled; publishes will be rejected`));
    }
    const caps = Object.hasOwn(capabilitiesByDriverClass, transport.DriverClass) ? capabilitiesByDriverClass[transport.DriverClass] : undefined;
    if (!caps) {
        issues.push(Issue('Error', topic.Name, `Transport '${transport.Name}' driver is unavailable: no driver is registered for DriverClass '${transport.DriverClass}'`));
        return issues;
    }
    const subscriptions = snapshot.Subscriptions.filter(s => UUIDsEqual(s.TopicID, topic.ID) && s.Status !== 'Disabled');
    issues.push(...FifoIssues(topic, transport, subscriptions));
    try {
        ToTopicBinding(topic);
    } catch (error) {
        issues.push(Issue('Error', topic.Name, error instanceof Error ? error.message : String(error)));
    }
    for (const subscription of subscriptions) {
        issues.push(...ValidateSubscription(topic, subscription, caps));
    }
    return issues;
}

function FifoIssues(topic: TopicRow, transport: TransportRow, subscriptions: SubscriptionRow[]): BindingValidationIssue[] {
    const isDatabase = transport.DriverClass === DATABASE_DRIVER_CLASS;
    if (isDatabase) {
        return topic.IsFifo ? [Issue('Warning', topic.Name, 'IsFifo has no effect on the Database transport')] : [];
    }
    // W7. Ordered is not listed: no cloud transport supports it, and SubscriptionUnsupportedReason says so per subscription.
    const needsFifo = subscriptions.some(s => s.PartitionMode === 'Exclusive');
    return needsFifo && !topic.IsFifo
        ? [Issue('Error', topic.Name, 'IsFifo must be true on cloud topics that have Exclusive subscriptions')]
        : [];
}

function ValidateSubscription(topic: TopicRow, subscription: SubscriptionRow, caps: TransportCapabilities): BindingValidationIssue[] {
    const issues: BindingValidationIssue[] = [];
    let reason: string | null;
    try {
        // Re-parsing with the transport's own FilterSupport is what rejects `startswith`, cross-field OR and the rest
        // on a cloud topic: the thrown message names the offending field and operator (03 §4.1).
        reason = SubscriptionUnsupportedReason(ToSubscriptionBinding(subscription, topic, caps.Filters), caps);
    } catch (error) {
        return [Issue('Error', subscription.Name, error instanceof Error ? error.message : String(error))];
    }
    if (reason) {
        issues.push(Issue('Error', subscription.Name, reason));
    }
    const ceiling = KNOWN_HOST_CEILING_SECONDS[subscription.HostType];
    if (ceiling !== null && subscription.MaxProcessingSeconds !== null && subscription.MaxProcessingSeconds > ceiling) {
        issues.push(Issue('Warning', subscription.Name, `MaxProcessingSeconds ${subscription.MaxProcessingSeconds} exceeds the ${subscription.HostType} host ceiling of ${ceiling} seconds`));
    }
    return issues;
}

function Issue(severity: 'Error' | 'Warning', subject: string, message: string): BindingValidationIssue {
    return { Severity: severity, Subject: subject, Message: message };
}
