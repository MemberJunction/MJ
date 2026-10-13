/**
 * EntityField not-loaded flag.
 *
 * The flag means: "the source this entity was hydrated from OMITTED this field's key."
 * Semantics under test:
 *   - set by every hydration entry point (LoadFromData fast path via hydrateFieldsIfNeeded,
 *     LoadFromData slow path, Hydrate) when the source omits a field's key
 *   - NEVER present on new (unhydrated) entities — their defaults are legitimate INSERT state
 *   - cleared by ANY explicit Set (the write-only / blind-set case must save)
 *   - not-loaded ⇒ never Dirty
 *   - Validate() exempts not-loaded fields from the required/null check (a denied NOT NULL
 *     field must not make unrelated edits unsaveable) while explicit nulls still fail
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import type { IEntityDataProvider } from '../generic/interfaces';
import {
    ALL_ENTITY_DATA,
    PRODUCT_ENTITY_ID,
    STANDALONE_ENTITY_ID,
} from './mocks/MockEntityData';

class MJTestEntity extends BaseEntity {
    /** Exposes the private post-save refresh for the save-response-corner tests (D-2). */
    public CallFinalizeSave(data: Record<string, unknown>): boolean {
        return (this as unknown as { finalizeSave(d: Record<string, unknown>, s: unknown): boolean }).finalizeSave(data, 'save');
    }
}

let entities: EntityInfo[];
let productEntityInfo: EntityInfo;   // parent-type → LoadFromData slow path; Name is NOT NULL, no default
let standaloneEntityInfo: EntityInfo; // non-parent → LoadFromData fast path (raw mode)

beforeAll(() => {
    entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    standaloneEntityInfo = entities.find(e => e.ID === STANDALONE_ENTITY_ID)!;

    const mockProvider = {
        Entities: entities,
        CurrentUser: { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] },
        // LoadFromData's slow path calls CacheRecordName → provider.SetCachedRecordName
        SetCachedRecordName: () => { /* noop */ },
        GetCachedRecordName: () => null,
    } as unknown as ProviderBase;
    Metadata.Provider = mockProvider;
    // LoadFromData's slow path resolves the entity's data provider via the static
    // BaseEntity.Provider (not Metadata.Provider) — point both at the mock.
    BaseEntity.Provider = mockProvider as unknown as IEntityDataProvider;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
    BaseEntity.Provider = null as unknown as IEntityDataProvider;
});

const PK = '11111111-2222-3333-4444-555555555555';

// ─── Hydration marks omissions ────────────────────────────────────────────

describe('not-loaded marking on hydration', () => {
    it('LoadFromData (fast/raw path): omitted keys are marked, present keys are not', async () => {
        const e = new MJTestEntity(standaloneEntityInfo);
        await e.LoadFromData({ ID: PK }); // Name omitted

        expect(e.GetFieldByName('Name')!.NotLoaded).toBe(true);
        expect(e.GetFieldByName('ID')!.NotLoaded).toBe(false);
    });

    it('LoadFromData (slow path — second load on the same instance): omitted keys are marked', async () => {
        const e = new MJTestEntity(standaloneEntityInfo);
        await e.LoadFromData({ ID: PK, Name: 'full' }); // full first load
        expect(e.GetFieldByName('Name')!.NotLoaded).toBe(false);

        await e.LoadFromData({ ID: PK }); // re-hydrate from a narrower source
        expect(e.GetFieldByName('Name')!.NotLoaded).toBe(true);
    });

    it('Hydrate: omitted keys are marked across the field set', () => {
        const e = new MJTestEntity(productEntityInfo);
        e.Hydrate({ ID: PK }); // Name and Price omitted

        expect(e.GetFieldByName('Name')!.NotLoaded).toBe(true);
        expect(e.GetFieldByName('Price')!.NotLoaded).toBe(true);
        expect(e.GetFieldByName('ID')!.NotLoaded).toBe(false);
    });

    it('a source containing every key marks nothing', async () => {
        const e = new MJTestEntity(standaloneEntityInfo);
        await e.LoadFromData({ ID: PK, Name: 'complete' });

        for (const f of e.Fields) {
            expect(f.NotLoaded).toBe(false);
        }
    });
});

// ─── Never on new entities ────────────────────────────────────────────────

describe('new (unhydrated) entities never carry the flag', () => {
    it('a freshly constructed entity has no not-loaded fields — defaults are INSERT state', () => {
        const e = new MJTestEntity(productEntityInfo);
        e.NewRecord();
        for (const f of e.Fields) {
            expect(f.NotLoaded).toBe(false);
        }
    });

    it('partial SetMany on a new entity marks nothing (SetMany is mutation, not hydration)', () => {
        const e = new MJTestEntity(productEntityInfo);
        e.NewRecord();
        e.SetMany({ Name: 'widget' }, true);
        expect(e.GetFieldByName('Price')!.NotLoaded).toBe(false);
    });
});

// ─── Explicit Set clears ──────────────────────────────────────────────────

describe('any explicit set clears the flag (the write-only / blind-set case)', () => {
    it('Set() on a not-loaded field clears NotLoaded and makes it dirty', () => {
        const e = new MJTestEntity(productEntityInfo);
        e.Hydrate({ ID: PK, Price: 10 }); // Name omitted
        expect(e.GetFieldByName('Name')!.NotLoaded).toBe(true);

        e.Set('Name', 'blind write');
        const nameField = e.GetFieldByName('Name')!;
        expect(nameField.NotLoaded).toBe(false);
        expect(nameField.Dirty).toBe(true);
    });
});

// ─── Dirty ────────────────────────────────────────────────────────────────

describe('not-loaded ⇒ never dirty', () => {
    it('a not-loaded field is not dirty regardless of its constructor state', () => {
        const e = new MJTestEntity(productEntityInfo);
        e.Hydrate({ ID: PK, Price: 10 });
        expect(e.GetFieldByName('Name')!.Dirty).toBe(false);
        expect(e.Dirty).toBe(false);
    });

    it('an unrelated edit dirties the entity while the not-loaded field stays clean', () => {
        const e = new MJTestEntity(productEntityInfo);
        e.Hydrate({ ID: PK, Price: 10 });

        e.Set('Price', 25);
        expect(e.Dirty).toBe(true);
        expect(e.GetFieldByName('Price')!.Dirty).toBe(true);
        expect(e.GetFieldByName('Name')!.Dirty).toBe(false);
    });
});

// ─── Save-response refresh (the create/update-response corner, D-2) ───────

describe('finalizeSave marks response-omitted fields (the save-response corner)', () => {
    it('a field the save response omitted becomes NotLoaded — its default cannot masquerade as confirmed', () => {
        const e = new MJTestEntity(standaloneEntityInfo);
        e.Hydrate({ ID: PK, Name: 'before' });

        // Server response with Name stripped (e.g. field security): the refresh re-hydrates
        // from it, and the omitted key must mark NotLoaded so the NEXT save skips it.
        e.CallFinalizeSave({ ID: PK });

        expect(e.GetFieldByName('Name')!.NotLoaded).toBe(true);
        expect(e.GetFieldByName('ID')!.NotLoaded).toBe(false);
        expect(e.Dirty).toBe(false);
    });

    it('a complete save response marks nothing', () => {
        const e = new MJTestEntity(standaloneEntityInfo);
        e.Hydrate({ ID: PK, Name: 'before' });

        e.CallFinalizeSave({ ID: PK, Name: 'after' });

        expect(e.GetFieldByName('Name')!.NotLoaded).toBe(false);
        expect(e.Get('Name')).toBe('after');
    });
});

// ─── Serialization surfaces (D-3) ─────────────────────────────────────────

describe('GetAll / CopyFrom treatment of not-loaded fields (D-3)', () => {
    it('GetAll OMITS not-loaded fields — their construction state never serializes as data', () => {
        const e = new MJTestEntity(productEntityInfo);
        e.Hydrate({ ID: PK, Price: 10 }); // Name omitted

        const all = e.GetAll();
        expect(all).not.toHaveProperty('Name');
        expect(all).toHaveProperty('ID');
        expect(all).toHaveProperty('Price');
    });

    it('GetAll includes a not-loaded field again after an explicit set', () => {
        const e = new MJTestEntity(productEntityInfo);
        e.Hydrate({ ID: PK, Price: 10 });
        e.Set('Name', 'now real');

        expect(e.GetAll()).toHaveProperty('Name', 'now real');
    });

    it('key-absence propagates the flag: hydrating another entity from GetAll output re-marks it', () => {
        const source = new MJTestEntity(productEntityInfo);
        source.Hydrate({ ID: PK, Price: 10 });

        const target = new MJTestEntity(productEntityInfo);
        target.Hydrate(source.GetAll());

        expect(target.GetFieldByName('Name')!.NotLoaded).toBe(true);
        expect(target.GetFieldByName('Price')!.NotLoaded).toBe(false);
    });

    it('CopyFrom skips fields the SOURCE never loaded', () => {
        const source = new MJTestEntity(productEntityInfo);
        source.Hydrate({ ID: PK, Price: 10 }); // Name not loaded on source

        const target = new MJTestEntity(productEntityInfo);
        target.Hydrate({ ID: PK, Name: 'target original', Price: 5 });
        target.CopyFrom(source);

        expect(target.Get('Name')).toBe('target original'); // untouched
        expect(target.Get('Price')).toBe(10);               // copied
    });
});

// ─── Validation exemption ─────────────────────────────────────────────────

describe('Validate() exemption for not-loaded fields', () => {
    it('an omitted NOT NULL / no-default field does not fail validation — unrelated edits stay saveable', () => {
        // Products.Name is AllowsNull=false with no DefaultValue: pre-D1 this exact shape made
        // every partially hydrated record unsaveable (the R5 breakage class).
        const e = new MJTestEntity(productEntityInfo);
        e.Hydrate({ ID: PK, Price: 10 }); // Name omitted → null + NotLoaded

        const result = e.Validate();
        const nameErrors = result.Errors.filter(err => err.Source === 'Name');
        expect(nameErrors).toHaveLength(0);
    });

    it('an EXPLICIT null on the same field still fails validation (the exemption is omission-only)', () => {
        const e = new MJTestEntity(productEntityInfo);
        e.Hydrate({ ID: PK, Price: 10 });
        e.Set('Name', null); // explicit set clears NotLoaded

        const result = e.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.some(err => err.Source === 'Name')).toBe(true);
    });
});
