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
import fs from 'node:fs';
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

/**
 * The MAP-level twin of the rule above, and why the seam guard alone is not enough.
 *
 * The enrolment guard is total per record — but for a map whose target IS that shape it refuses
 * EVERY record, and the branch around it has already skipped `BeginTransaction` on the strength
 * of a group existing. That leaves the group empty, no transaction open, records saving
 * individually, and `Submit()` returning true because an empty group short-circuits — a
 * non-atomic batch reporting itself as an atomic one. On a mid-batch failure the fallback then
 * re-applies rows that already committed, and a server-assigned identity gives nothing to
 * recognise the first copy by: duplicates, from the other direction.
 *
 * So the decision belongs at the map, before the group is created. These pin that it is made
 * there and that it did not drift back to the connection level.
 */
describe('entityMapHasIdentityOnlyPK — batching is decided per entity map', () => {
    type MapHost = {
        entityMapHasIdentityOnlyPK: (m: unknown) => boolean;
        ProviderToUse?: unknown;
    };

    /** An engine whose metadata answers with the given PK shape for 'Target'. */
    function hostWithTargetPKs(pks: Array<{ Name: string; AutoIncrement?: boolean }> | undefined): MapHost {
        const host = Object.create(IntegrationEngine.prototype) as unknown as MapHost;
        Object.defineProperty(host, 'ProviderToUse', {
            value: { EntityByName: (name: string) => (name === 'Target' ? { PrimaryKeys: pks } : undefined) },
            configurable: true,
        });
        return host;
    }

    it('refuses a map whose target identity is a single auto-increment column', () => {
        const host = hostWithTargetPKs([{ Name: 'ID', AutoIncrement: true }]);
        expect(host.entityMapHasIdentityOnlyPK({ Entity: 'Target' })).toBe(true);
    });

    it('allows the ordinary client-generated uuid target', () => {
        const host = hostWithTargetPKs([{ Name: 'ID', AutoIncrement: false }]);
        expect(host.entityMapHasIdentityOnlyPK({ Entity: 'Target' })).toBe(false);
    });

    it('allows a composite key that merely CONTAINS an identity column', () => {
        // Same distinction the enrolment guard draws: the unsafe property is "the whole identity
        // is server-assigned", not "an identity column is present" — the other members still
        // carry values before the save.
        const host = hostWithTargetPKs([
            { Name: 'TenantID', AutoIncrement: false },
            { Name: 'Seq', AutoIncrement: true },
        ]);
        expect(host.entityMapHasIdentityOnlyPK({ Entity: 'Target' })).toBe(false);
    });

    it('does not refuse a map whose entity metadata cannot be resolved', () => {
        // Unknown shape must not silently disable batching for the map — the enrolment seam is
        // still there per record, and that is where an unknown entity gets its answer.
        const host = hostWithTargetPKs(undefined);
        expect(host.entityMapHasIdentityOnlyPK({ Entity: 'Missing' })).toBe(false);
        expect(host.entityMapHasIdentityOnlyPK({})).toBe(false);
    });

    it('is WIRED into the batching decision, not merely available', () => {
        // Nothing else in this suite would notice if the gate were dropped: every other test
        // observes what the writes do, and an empty group still reports success. Same reason the
        // BatchedSubmit assignment has its own pin.
        const source = fs.readFileSync(new URL('../IntegrationEngine.ts', import.meta.url), 'utf-8');
        expect(source).toMatch(/const batchedWrites\s*=\s*this\.ReadWriteMode\([^)]*\)\s*===\s*'batched'\s*\n?\s*&&\s*!this\.entityMapHasIdentityOnlyPK\(entityMap\)/);
    });
});
