import { describe, it, expect } from 'vitest';
import { AuthorizeWorkQueueOperator, OPERATOR_OPERATE_ENTITY, OPERATOR_READ_ENTITY } from '../operations/operatorAuthorization';
import type { EntityPermissionLookup } from '../operations/operatorAuthorization';
import { TEST_USER } from './runtimeFakes';

function lookup(grants: Record<string, { CanRead: boolean; CanUpdate: boolean }>, seen: string[] = []): EntityPermissionLookup {
    return entityName => {
        seen.push(entityName);
        return grants[entityName] ?? null;
    };
}

describe('AuthorizeWorkQueueOperator', () => {
    it('requires Read on the deliveries entity for read operations', () => {
        const seen: string[] = [];
        expect(AuthorizeWorkQueueOperator('read', TEST_USER, lookup({ [OPERATOR_READ_ENTITY]: { CanRead: true, CanUpdate: false } }, seen))).toBe(true);
        expect(AuthorizeWorkQueueOperator('read', TEST_USER, lookup({ [OPERATOR_READ_ENTITY]: { CanRead: false, CanUpdate: true } }))).toBe(false);
        expect(seen).toEqual(['MJ: Work Queue Deliveries']);
    });

    it('requires Update on the subscriptions entity for operate operations', () => {
        const seen: string[] = [];
        expect(AuthorizeWorkQueueOperator('operate', TEST_USER, lookup({ [OPERATOR_OPERATE_ENTITY]: { CanRead: true, CanUpdate: true } }, seen))).toBe(true);
        expect(AuthorizeWorkQueueOperator('operate', TEST_USER, lookup({ [OPERATOR_OPERATE_ENTITY]: { CanRead: true, CanUpdate: false } }))).toBe(false);
        expect(seen).toEqual(['MJ: Work Queue Subscriptions']);
    });

    it('fails closed when the entity is unknown or the lookup throws', () => {
        expect(AuthorizeWorkQueueOperator('read', TEST_USER, lookup({}))).toBe(false);
        expect(AuthorizeWorkQueueOperator('operate', TEST_USER, () => { throw new Error('metadata not loaded'); })).toBe(false);
    });
});
