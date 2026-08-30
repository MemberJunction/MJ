/**
 * Which entities may be enrolled in a batch's write group.
 *
 * Enrolment defers the WRITE to `Submit()` — `Save()` returns true before the row exists — and
 * the caller reads `entity.PrimaryKey` immediately afterwards to build the record map. That is
 * safe for every shape sync produces except ONE: a single auto-increment primary key, whose value
 * only exists after the insert executes. Enrolling such an entity would write a blank
 * `EntityRecordID` and reintroduce the duplicate-on-every-incremental-sync failure the record-map
 * code documents — silently, because the save still reports success.
 *
 * These tests pin the rule at the enrolment seam, where it is cheap and total, rather than at the
 * record-map site where it would have to be re-derived by every future caller.
 */
import { describe, it, expect } from 'vitest';
import { IntegrationEngine } from '../IntegrationEngine.js';
import type { BaseEntity } from '@memberjunction/core';

type Host = { enrolInWriteGroup: (entity: BaseEntity) => void };

/** A stand-in write group — identity is all the assertions need. */
const GROUP = { marker: 'the-batch-group' } as unknown as NonNullable<BaseEntity['TransactionGroup']>;

/** Builds the engine on its prototype and puts `group` in the run context, as an apply batch does. */
function inBatch<T>(group: unknown, fn: (host: Host) => T): T {
    const host = Object.create(IntegrationEngine.prototype) as unknown as Host;
    const als = (IntegrationEngine as unknown as {
        runContext: { run: (ctx: unknown, f: () => T) => T };
    }).runContext;
    return als.run({ writeGroup: group }, () => fn(host));
}

/** An entity whose EntityInfo declares the given primary-key shape. */
function entityWithPKs(pks: Array<{ Name: string; AutoIncrement?: boolean }>): BaseEntity {
    return {
        EntityInfo: { Name: 'Fixture', PrimaryKeys: pks },
        TransactionGroup: undefined,
    } as unknown as BaseEntity;
}

describe('enrolInWriteGroup', () => {
    it('enrols a client-generated single uuid key — the ordinary synced shape', () => {
        const entity = entityWithPKs([{ Name: 'ID', AutoIncrement: false }]);
        inBatch(GROUP, host => host.enrolInWriteGroup(entity));
        expect(entity.TransactionGroup).toBe(GROUP);
    });

    it('enrols a composite/soft key — its values come from the mapped fields before the save', () => {
        const entity = entityWithPKs([
            { Name: 'TenantID', AutoIncrement: false },
            { Name: 'ExternalID', AutoIncrement: false },
        ]);
        inBatch(GROUP, host => host.enrolInWriteGroup(entity));
        expect(entity.TransactionGroup).toBe(GROUP);
    });

    it('REFUSES a single auto-increment key — its value cannot exist before Submit', () => {
        const entity = entityWithPKs([{ Name: 'ID', AutoIncrement: true }]);
        inBatch(GROUP, host => host.enrolInWriteGroup(entity));
        expect(
            entity.TransactionGroup,
            'an identity-PK entity must save immediately; enrolling it writes a blank EntityRecordID into the record map',
        ).toBeUndefined();
    });

    it('still enrols when only PART of a composite key is auto-increment', () => {
        // The unsafe shape is specifically "the whole identity is server-assigned". A composite
        // key still carries mapped values, so the record map is well-formed.
        const entity = entityWithPKs([
            { Name: 'ID', AutoIncrement: true },
            { Name: 'ExternalID', AutoIncrement: false },
        ]);
        inBatch(GROUP, host => host.enrolInWriteGroup(entity));
        expect(entity.TransactionGroup).toBe(GROUP);
    });

    it('is a no-op outside a batch — every existing caller saves immediately, exactly as before', () => {
        const entity = entityWithPKs([{ Name: 'ID', AutoIncrement: false }]);
        inBatch(undefined, host => host.enrolInWriteGroup(entity));
        expect(entity.TransactionGroup).toBeUndefined();
    });
});
