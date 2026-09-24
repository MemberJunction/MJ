import type { FieldIssue } from '@memberjunction/work-queue-base';

export interface PartitionModeChange {
    IsSaved: boolean;
    Changed: boolean;
    OldValue: string | null;
    NewValue: string;
}

/**
 * F11 (03 §3.1): Delivery.PartitionKey is populated only for partitioned subscriptions, so changing the mode under
 * existing deliveries would leave them inconsistent. New records and unchanged modes never reach the database.
 */
export async function CheckPartitionModeChange(change: PartitionModeChange, hasDeliveries: () => Promise<boolean>): Promise<FieldIssue | null> {
    if (!change.IsSaved || !change.Changed || !(await hasDeliveries())) {
        return null;
    }
    return {
        Field: 'PartitionMode',
        Message: `PartitionMode cannot change from '${change.OldValue}' to '${change.NewValue}' once the subscription has deliveries; create a new subscription instead`,
        Value: change.NewValue,
    };
}
