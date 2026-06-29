import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { ReadOnlyExternalBaseEntity } from '../custom/ReadOnlyExternalBaseEntity';

/**
 * Concrete subclass for testing the read-only short-circuit. ReadOnlyExternalBaseEntity is
 * abstract; CodeGen emits external-entity subclasses that extend it the same way.
 */
class TestReadOnlyEntity extends ReadOnlyExternalBaseEntity {}

/**
 * Minimal EntityInfo stub. BaseEntity's constructor only asserts the entity is non-null and not
 * 'disabled', and init() no-ops when IsChildType is falsy — so this is enough to construct the
 * entity without a provider. Cast-through-unknown is the accepted fixture pattern for entity
 * unit tests.
 */
const makeEntityInfo = (over: Record<string, unknown> = {}): EntityInfo =>
    ({ Name: 'External Sales', Status: 'Active', ...over } as unknown as EntityInfo);

describe('ReadOnlyExternalBaseEntity', () => {
    it('Save() returns false and records a failed "update" result naming the entity (no remote write)', async () => {
        const e = new TestReadOnlyEntity(makeEntityInfo());
        const ok = await e.Save();
        expect(ok).toBe(false);
        expect(e.LatestResult).toBeTruthy();
        expect(e.LatestResult.Success).toBe(false);
        expect(e.LatestResult.Type).toBe('update');
        expect(e.LatestResult.Message).toMatch(/read-only/i);
        expect(e.LatestResult.Message).toMatch(/save is not supported/i);
        expect(e.LatestResult.Message).toContain('External Sales');
    });

    it('Delete() returns false and records a failed "delete" result', async () => {
        const e = new TestReadOnlyEntity(makeEntityInfo());
        const ok = await e.Delete();
        expect(ok).toBe(false);
        expect(e.LatestResult.Success).toBe(false);
        expect(e.LatestResult.Type).toBe('delete');
        expect(e.LatestResult.Message).toMatch(/read-only/i);
        expect(e.LatestResult.Message).toMatch(/delete is not supported/i);
    });

    it('falls back to a generic subject when the entity has no Name', async () => {
        const e = new TestReadOnlyEntity(makeEntityInfo({ Name: undefined }));
        await e.Save();
        expect(e.LatestResult.Message).toContain('This entity');
    });
});
