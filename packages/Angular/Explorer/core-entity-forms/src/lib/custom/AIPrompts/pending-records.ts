import { PendingRecordItem } from '@memberjunction/ng-base-types';

/**
 * One pending record per entity object. The base form only clears its pending list after a SUCCESSFUL
 * save, and `MJAIPromptFormComponentExtended.PopulatePendingRecords()` preserves the previous list and
 * re-collects from its child editors on every call, so a retry after a failed save would otherwise
 * hold the same content entity twice: two `Save()` calls on one object in one transaction group, two
 * creates with the same client-generated ID, a primary-key violation. The first occurrence wins,
 * keeping its action.
 */
export function dedupePendingRecordsByEntity(records: readonly PendingRecordItem[]): PendingRecordItem[] {
    const seen = new Set<object>();
    const unique: PendingRecordItem[] = [];
    for (const record of records) {
        if (seen.has(record.entityObject)) {
            continue;
        }
        seen.add(record.entityObject);
        unique.push(record);
    }
    return unique;
}
