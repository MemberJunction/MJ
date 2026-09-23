/**
 * `MJAIPromptFormComponentExtended.PopulatePendingRecords()` preserves the previous pending list and
 * re-collects from its child editors on every call, and the base form clears that list only after a
 * SUCCESSFUL save. A retry after a failed save therefore sees the same content entity twice: two
 * `Save()` calls on one object in one transaction group, two creates with one client-generated ID.
 * The dedupe keeps one pending record per entity object, first occurrence (and its action) winning.
 */
import { describe, it, expect } from 'vitest';
import type { BaseEntity } from '@memberjunction/core';
import type { PendingRecordItem } from '@memberjunction/ng-base-types';
import { dedupePendingRecordsByEntity } from '../lib/custom/AIPrompts/pending-records';

function entity(id: string): BaseEntity {
    return { ID: id } as unknown as BaseEntity;
}

function pending(entityObject: BaseEntity, action: PendingRecordItem['action'] = 'save'): PendingRecordItem {
    return { entityObject, action };
}

describe('dedupePendingRecordsByEntity', () => {
    it('drops a second pending record for the same entity object, keeping the first', () => {
        const content = entity('C1');
        const template = entity('T1');
        const result = dedupePendingRecordsByEntity([pending(template), pending(content), pending(content)]);
        expect(result.map(r => r.entityObject)).toEqual([template, content]);
    });

    it('treats distinct objects with the same ID as distinct: identity, not ID, is the key', () => {
        const a = entity('SAME');
        const b = entity('SAME');
        expect(dedupePendingRecordsByEntity([pending(a), pending(b)])).toHaveLength(2);
    });

    it('keeps the first action when the same entity appears with two actions', () => {
        const content = entity('C1');
        const result = dedupePendingRecordsByEntity([pending(content, 'delete'), pending(content, 'save')]);
        expect(result).toEqual([pending(content, 'delete')]);
    });

    it('returns an empty list for an empty list', () => {
        expect(dedupePendingRecordsByEntity([])).toEqual([]);
    });
});
