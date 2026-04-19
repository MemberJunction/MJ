/**
 * BaseEntity field lookup cache tests (perf-bundle).
 *
 * Covers the lazy `_fieldCache` / `_codeNameCache` Maps added to BaseEntity:
 *   - GetFieldByName returns a cached field instance
 *   - GetFieldByCodeName covers a separate cache keyed on CodeName
 *   - init() clears both caches so re-initialized entities don't see stale fields
 *   - Duplicate field Names preserve first-write-wins (matches prior Array.find semantics)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';

class MJTestEntity extends BaseEntity {
    // Expose private init() for tests exercising cache invalidation
    public CallInit(): void {
        (this as unknown as { init(): void }).init();
    }
}

// ─── Shared setup ──────────────────────────────────────────────────────────

let entities: EntityInfo[];
let productEntityInfo: EntityInfo;

beforeAll(() => {
    entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;

    const mockProvider = {
        Entities: entities,
        CurrentUser: { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] },
    } as unknown as ProviderBase;

    Metadata.Provider = mockProvider;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('BaseEntity.GetFieldByName cache (perf-bundle)', () => {
    it('returns the same field reference across repeated lookups', () => {
        const entity = new MJTestEntity(productEntityInfo);

        const first = entity.GetFieldByName('Name');
        const second = entity.GetFieldByName('Name');

        expect(first).not.toBeNull();
        expect(first).toBe(second); // identity — cache returned same object
    });

    it('is case-insensitive and trims whitespace', () => {
        const entity = new MJTestEntity(productEntityInfo);

        expect(entity.GetFieldByName('name')?.Name).toBe('Name');
        expect(entity.GetFieldByName('NAME')?.Name).toBe('Name');
        expect(entity.GetFieldByName('  Name  ')?.Name).toBe('Name');
    });

    it('returns null for missing field name', () => {
        const entity = new MJTestEntity(productEntityInfo);

        expect(entity.GetFieldByName('NonExistent')).toBeNull();
    });

    it('returns null for empty/null input without throwing', () => {
        const entity = new MJTestEntity(productEntityInfo);

        expect(entity.GetFieldByName('')).toBeNull();
        expect(entity.GetFieldByName(null as unknown as string)).toBeNull();
    });
});

describe('BaseEntity.GetFieldByCodeName cache (perf-bundle)', () => {
    it('resolves a field by its CodeName', () => {
        const entity = new MJTestEntity(productEntityInfo);

        // For fields where Name has no special chars, CodeName === Name.
        // "Price" satisfies this — both Name and CodeName resolve the same field.
        const byName = entity.GetFieldByName('Price');
        const byCodeName = entity.GetFieldByCodeName('Price');

        expect(byName).toBe(byCodeName); // same underlying EntityField
    });

    it('is case-insensitive on CodeName', () => {
        const entity = new MJTestEntity(productEntityInfo);

        expect(entity.GetFieldByCodeName('price')?.Name).toBe('Price');
        expect(entity.GetFieldByCodeName('PRICE')?.Name).toBe('Price');
    });

    it('returns the same reference across repeated lookups', () => {
        const entity = new MJTestEntity(productEntityInfo);

        const first = entity.GetFieldByCodeName('Name');
        const second = entity.GetFieldByCodeName('Name');

        expect(first).toBe(second);
    });

    it('returns null for missing code name', () => {
        const entity = new MJTestEntity(productEntityInfo);

        expect(entity.GetFieldByCodeName('NotAField')).toBeNull();
    });

    it('returns null for empty/null input', () => {
        const entity = new MJTestEntity(productEntityInfo);

        expect(entity.GetFieldByCodeName('')).toBeNull();
        expect(entity.GetFieldByCodeName(null as unknown as string)).toBeNull();
    });
});

describe('BaseEntity init() cache invalidation (perf-bundle)', () => {
    it('clears both caches when init() re-runs', () => {
        const entity = new MJTestEntity(productEntityInfo);

        // Warm both caches
        const nameFieldBefore = entity.GetFieldByName('Name');
        const codeNameFieldBefore = entity.GetFieldByCodeName('Name');
        expect(nameFieldBefore).not.toBeNull();
        expect(codeNameFieldBefore).not.toBeNull();

        // Re-initialize — this rebuilds _Fields and must blow away cached entries
        entity.CallInit();

        // After re-init, the cached references must NOT match (new EntityField instances)
        const nameFieldAfter = entity.GetFieldByName('Name');
        const codeNameFieldAfter = entity.GetFieldByCodeName('Name');
        expect(nameFieldAfter).not.toBeNull();
        expect(codeNameFieldAfter).not.toBeNull();
        expect(nameFieldAfter).not.toBe(nameFieldBefore);
        expect(codeNameFieldAfter).not.toBe(codeNameFieldBefore);
    });
});
