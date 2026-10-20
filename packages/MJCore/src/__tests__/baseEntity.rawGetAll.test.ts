/**
 * Raw-mode GetAll() and default-skipping on hydration.
 *
 * A record loaded through LoadFromData's fast path stays in "raw mode" (no EntityField
 * instances) until something needs them. GetAll() now serializes straight from the raw row
 * instead of hydrating first, so it must return exactly what the hydrated path returns:
 * the same keys (NotLoaded keys omitted), dates parsed, fixed-width strings rtrimmed.
 *
 * Hydrating a loaded record also skips each field's metadata default: every key the row
 * carries overwrites it anyway, and a key the row omits is NotLoaded, where a default the
 * row never had would be a value nobody loaded. New records still get their defaults.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseEntity, EntityField } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import type { IEntityDataProvider } from '../generic/interfaces';
import { STANDALONE_ENTITY_DATA } from './mocks/MockEntityData';

class MJTestEntity extends BaseEntity {}

/** Reads the private hydration flag, to show GetAll() leaves a raw-mode record raw. */
function isHydrated(e: BaseEntity): boolean {
    return (e as unknown as { _fieldsHydrated: boolean })._fieldsHydrated;
}

const ENTITY_ID = 'entity-raw-getall-001';
const baseField = STANDALONE_ENTITY_DATA.EntityFields[1];

function fieldData(name: string, type: string, sequence: number, extra: Record<string, unknown> = {}) {
    return { ...baseField, ID: `f-rg-${name}`, EntityID: ENTITY_ID, Name: name, Type: type, Sequence: sequence, IsNameField: false, ...extra };
}

const ENTITY_DATA = {
    ...STANDALONE_ENTITY_DATA,
    ID: ENTITY_ID,
    Name: 'Raw GetAll Items',
    BaseTable: 'RawGetAllItem',
    BaseView: 'vwRawGetAllItems',
    EntityFields: [
        { ...STANDALONE_ENTITY_DATA.EntityFields[0], ID: 'f-rg-id', EntityID: ENTITY_ID },
        fieldData('Name', 'nvarchar', 2, { Length: 200, IsNameField: true }),
        fieldData('Status', 'nvarchar', 3, { Length: 100, DefaultValue: 'Pending' }),
        fieldData('Priority', 'int', 4, { Length: 4, DefaultValue: '5' }),
        fieldData('DueAt', 'datetime2', 5, { Length: 8 }),
        fieldData('Code', 'nchar', 6, { Length: 10 }),
        fieldData('Stage', 'nvarchar', 7, { Length: 100, DefaultValue: 'Draft', AllowsNull: false }),
        fieldData('Due Date', 'datetime2', 8, { Length: 8 }),
    ],
    EntityPermissions: STANDALONE_ENTITY_DATA.EntityPermissions.map(p => ({ ...p, EntityID: ENTITY_ID })),
};

let entityInfo: EntityInfo;

beforeAll(() => {
    entityInfo = new EntityInfo(ENTITY_DATA);
    const mockProvider = {
        Entities: [entityInfo],
        CurrentUser: { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] },
        SetCachedRecordName: () => { /* noop */ },
        GetCachedRecordName: () => null,
    } as unknown as ProviderBase;
    Metadata.Provider = mockProvider;
    BaseEntity.Provider = mockProvider as unknown as IEntityDataProvider;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
    BaseEntity.Provider = null as unknown as IEntityDataProvider;
});

const PK = '11111111-2222-3333-4444-555555555555';
const FULL_ROW = {
    ID: PK,
    Name: 'Widget',
    Status: 'Shipped',
    Priority: 0,
    DueAt: '2026-03-04T05:06:07.890Z',
    Code: 'AB        ',
};

async function loaded(row: Record<string, unknown>): Promise<MJTestEntity> {
    const e = new MJTestEntity(entityInfo);
    await e.LoadFromData(row);
    return e;
}

/** The same record with its fields hydrated, which takes GetAll() down the original path. */
async function loadedAndHydrated(row: Record<string, unknown>): Promise<MJTestEntity> {
    const e = await loaded(row);
    void e.Fields; // the Fields getter hydrates
    expect(isHydrated(e)).toBe(true);
    return e;
}

describe('GetAll() on a raw-mode record', () => {
    it('returns exactly what the hydrated record returns', async () => {
        const raw = await loaded(FULL_ROW);
        expect(isHydrated(raw)).toBe(false);
        const hydrated = await loadedAndHydrated(FULL_ROW);

        expect(raw.GetAll()).toEqual(hydrated.GetAll());
    });

    it('does not hydrate the record', async () => {
        const e = await loaded(FULL_ROW);
        e.GetAll();
        expect(isHydrated(e)).toBe(false);
    });

    it('parses dates, rtrims fixed-width strings, and keeps 0 and null values', async () => {
        const all = (await loaded({ ...FULL_ROW, Name: null })).GetAll();
        expect(all['DueAt']).toEqual(new Date('2026-03-04T05:06:07.890Z'));
        expect(all['Code']).toBe('AB');
        expect(all['Priority']).toBe(0);
        expect(all).toHaveProperty('Name', null);
    });

    it('omits keys the row did not carry, as the hydrated path omits NotLoaded fields', async () => {
        const row = { ID: PK, Name: 'Partial' };
        const raw = (await loaded(row)).GetAll();
        expect(Object.keys(raw).sort()).toEqual(['ID', 'Name']);
        expect(raw).toEqual((await loadedAndHydrated(row)).GetAll());
    });

    it('returns the loaded values for oldValues, and nothing for dirty-only (nothing has changed)', async () => {
        const e = await loaded(FULL_ROW);
        expect(e.GetAll(true)).toEqual((await loadedAndHydrated(FULL_ROW)).GetAll(true));
        expect(e.GetAll(false, true)).toEqual({});
    });

    it('returns the same Date instance on repeated calls (the conversion is memoized)', async () => {
        const e = await loaded(FULL_ROW);
        expect(e.GetAll()['DueAt']).toBe(e.GetAll()['DueAt']);
    });
});

describe('metadata defaults when hydrating a loaded record', () => {
    it('leaves a field the row omitted empty instead of filling in its default', async () => {
        const e = await loaded({ ID: PK, Name: 'No status' });
        const status = e.GetFieldByName('Status')!;
        expect(status.NotLoaded).toBe(true);
        expect(status.Value).toBeNull();
        expect(status.Dirty).toBe(false);
        expect(e.GetFieldByName('Priority')!.Value).toBeNull();
    });

    it('keeps the loaded value, including an explicit null, over the default', async () => {
        const e = await loaded({ ...FULL_ROW, Status: null, Priority: 0 });
        expect(e.Get('Status')).toBeNull();
        expect(e.Get('Priority')).toBe(0);
        expect(e.Dirty).toBe(false);
    });

    it('still applies defaults to a new record', () => {
        const e = new MJTestEntity(entityInfo);
        e.NewRecord();
        expect(e.Get('Status')).toBe('Pending');
        expect(e.Get('Priority')).toBe(5);
    });

    it('applies defaults again when a loaded instance is reset to a new record', async () => {
        const e = await loaded({ ID: PK, Name: 'Reused' });
        e.NewRecord();
        expect(e.Get('Status')).toBe('Pending');
        expect(e.Get('Priority')).toBe(5);
    });
});

describe('EntityField skipDefaultValue', () => {
    it('starts at null when asked to skip the default, and at the default otherwise', () => {
        const statusInfo = entityInfo.FieldByName('Status')!;
        expect(new EntityField(statusInfo, undefined, true).Value).toBeNull();
        expect(new EntityField(statusInfo).Value).toBe('Pending');
    });
});

describe('fields a hydration source omitted hold nothing', () => {
    it('a reload that omits a field clears the previous record\'s value', async () => {
        const e = await loadedAndHydrated(FULL_ROW);
        await e.LoadFromData({ ID: PK, Name: 'Second row' });
        const status = e.GetFieldByName('Status')!;
        expect(status.NotLoaded).toBe(true);
        expect(e.Get('Status')).toBeNull();
        expect(status.Dirty).toBe(false);
    });

    it('Hydrate() leaves an omitted field empty instead of holding its default', () => {
        const e = new MJTestEntity(entityInfo);
        e.Hydrate({ ID: PK, Name: 'Hydrated' });
        expect(e.GetFieldByName('Status')!.NotLoaded).toBe(true);
        expect(e.Get('Status')).toBeNull();
    });

    it('MarkNotLoaded() on its own keeps the in-memory value (a save leaving a field out of the update)', async () => {
        const e = await loadedAndHydrated(FULL_ROW);
        const status = e.GetFieldByName('Status')!;
        status.MarkNotLoaded();
        expect(status.NotLoaded).toBe(true);
        expect(status.Value).toBe('Shipped');
    });
});

describe('an explicit write onto a not-loaded field', () => {
    it('is dirty and fails validation when it writes null to a NOT NULL field that has a default', async () => {
        const e = await loaded({ ID: PK, Name: 'No stage' });
        e.Set('Stage', null);
        const stage = e.GetFieldByName('Stage')!;
        expect(stage.NotLoaded).toBe(false);
        expect(stage.Dirty).toBe(true);
        expect(stage.Validate().Success).toBe(false);
    });

    it('is dirty even when it writes null to a nullable field, so the write reaches the save', async () => {
        const e = await loaded({ ID: PK, Name: 'No status' });
        e.Set('Status', null);
        expect(e.GetFieldByName('Status')!.Dirty).toBe(true);
        expect(e.Dirty).toBe(true);
    });

    it('stops being dirty once the old value is reset, as after a save', async () => {
        const e = await loaded({ ID: PK, Name: 'No status' });
        e.Set('Status', null);
        const status = e.GetFieldByName('Status')!;
        status.ResetOldValue();
        expect(status.Dirty).toBe(false);
    });

    it('stops being dirty when the field is not-loaded again', async () => {
        const e = await loaded({ ID: PK, Name: 'No status' });
        e.Set('Status', 'Typed');
        const status = e.GetFieldByName('Status')!;
        status.MarkNotLoaded();
        expect(status.Dirty).toBe(false);
    });

    it('is undone by Revert(), which puts the field back to not-loaded', async () => {
        const e = await loaded({ ID: PK, Name: 'No status' });
        e.Set('Status', 'Typed');
        expect(e.Revert()).toBe(true);
        const status = e.GetFieldByName('Status')!;
        expect(status.NotLoaded).toBe(true);
        expect(status.Value).toBeNull();
        expect(e.Dirty).toBe(false);
    });

    it('Revert() leaves fields that were never loaded not-loaded', async () => {
        const e = await loaded({ ID: PK, Name: 'Original' });
        e.Set('Name', 'Edited');
        e.Revert();
        expect(e.Get('Name')).toBe('Original');
        expect(e.GetFieldByName('Status')!.NotLoaded).toBe(true);
        expect(e.Dirty).toBe(false);
    });

    it('survives a GetState / RestoreState round trip', async () => {
        const e = await loaded({ ID: PK, Name: 'No status' });
        e.Set('Status', null);
        const status = e.GetFieldByName('Status')!;
        const state = status.GetState();
        status.ResetOldValue();
        expect(status.Dirty).toBe(false);
        status.RestoreState(state);
        expect(status.Dirty).toBe(true);
    });
});

describe('a raw-mode row keyed by a field\'s CodeName', () => {
    // "Due Date" has the CodeName "Due_Date". Hydration accepts either key, as SetMany does.
    const row = { ID: PK, Name: 'By CodeName', Due_Date: '2026-01-02T03:04:05.000Z' };

    it('reads through Get() and GetAll() before hydration', async () => {
        const e = await loaded(row);
        expect(e.Get('Due Date')).toEqual(new Date('2026-01-02T03:04:05.000Z'));
        expect(e.GetAll()['Due Date']).toEqual(new Date('2026-01-02T03:04:05.000Z'));
        expect(isHydrated(e)).toBe(false);
    });

    it('loads into the field when hydrated, which is not marked not-loaded', async () => {
        const e = await loadedAndHydrated(row);
        const due = e.GetFieldByName('Due Date')!;
        expect(due.NotLoaded).toBe(false);
        expect(due.Value).toEqual(new Date('2026-01-02T03:04:05.000Z'));
    });

    it('gives the same GetAll() before and after hydration', async () => {
        expect((await loaded(row)).GetAll()).toEqual((await loadedAndHydrated(row)).GetAll());
    });
});
