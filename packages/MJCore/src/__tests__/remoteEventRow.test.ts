/**
 * `ResolveEntityEventRow` / `ResolveEntityEventKey` — the row behind a remote-invalidate event.
 *
 * These exist because cache-invalidation events reach every client on one unfiltered
 * subscription, so the server withholds the row unless a deployment allowlisted the entity. The
 * contract that matters: a consumer still gets its row, through a read the server access-controls,
 * and gets `null` — not someone else's data, and not an exception — when it may not have it.
 */
import { describe, it, expect, vi } from 'vitest';
import { ResolveEntityEventRow, ResolveEntityEventKey } from '../generic/remoteEventRow';
import { CompositeKey } from '../generic/compositeKey';
import type { BaseEntityEvent } from '../generic/baseEntity';
import type { IMetadataProvider } from '../generic/interfaces';

const KEY_JSON = JSON.stringify([{ FieldName: 'ID', Value: 'abc-123' }]);

function remoteEvent(payload: Record<string, unknown>, entityName = 'MJ: Conversation Details'): BaseEntityEvent {
    return { type: 'remote-invalidate', baseEntity: null, entityName, payload } as unknown as BaseEntityEvent;
}

/** A provider whose keyed read returns `row`, or refuses by returning an unsaved record. */
function providerReturning(row: Record<string, unknown> | null, spy?: ReturnType<typeof vi.fn>): IMetadataProvider {
    return {
        GetEntityObject: spy ?? vi.fn(async () => ({
            IsSaved: row !== null,
            GetAll: () => row,
        })),
    } as unknown as IMetadataProvider;
}

describe('ResolveEntityEventRow', () => {
    it('uses the live entity for a local event and never reads', async () => {
        const read = vi.fn();
        const local = { baseEntity: { GetAll: () => ({ ID: 'local-1' }) } } as unknown as BaseEntityEvent;
        const row = await ResolveEntityEventRow(local, providerReturning(null, read));
        expect(row).toEqual({ ID: 'local-1' });
        expect(read).not.toHaveBeenCalled();
    });

    it('parses recordData when the entity is allowlisted, without reading', async () => {
        const read = vi.fn();
        const evt = remoteEvent({ recordData: JSON.stringify({ ID: 'abc-123', ConversationID: 'conv-9' }) });
        const row = await ResolveEntityEventRow(evt, providerReturning(null, read));
        expect(row).toEqual({ ID: 'abc-123', ConversationID: 'conv-9' });
        expect(read).not.toHaveBeenCalled();
    });

    // The reason this module exists: the FK the primary key cannot carry.
    it('re-reads by key when the row was withheld, recovering a non-key field', async () => {
        const evt = remoteEvent({ primaryKeyValues: KEY_JSON });
        const row = await ResolveEntityEventRow(evt, providerReturning({ ID: 'abc-123', ConversationID: 'conv-9' }));
        expect(row).toEqual({ ID: 'abc-123', ConversationID: 'conv-9' });
    });

    it('reads with the key the event carried, not a fabricated one', async () => {
        const read = vi.fn(async () => ({ IsSaved: true, GetAll: () => ({ ID: 'abc-123' }) }));
        await ResolveEntityEventRow(remoteEvent({ primaryKeyValues: KEY_JSON }), providerReturning(null, read));
        const [entityName, key] = read.mock.calls[0] as unknown as [string, CompositeKey];
        expect(entityName).toBe('MJ: Conversation Details');
        expect(key.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: 'abc-123' }]);
    });

    // The security property, and it has to be asserted against a record that WOULD hand over
    // fields: a refused load still returns an entity object, so gating on anything other than
    // `IsSaved` would pass this row on. A stub whose GetAll() is already null proves nothing.
    it('returns null when the read is refused, even though the record would yield fields', async () => {
        const refused = {
            GetEntityObject: vi.fn(async () => ({
                IsSaved: false,
                GetAll: () => ({ ID: 'abc-123', Secret: 'must-not-escape' }),
            })),
        } as unknown as IMetadataProvider;
        const evt = remoteEvent({ primaryKeyValues: KEY_JSON });
        await expect(ResolveEntityEventRow(evt, refused)).resolves.toBeNull();
    });

    it('returns null when the read throws', async () => {
        const read = vi.fn(async () => { throw new Error('denied'); });
        const evt = remoteEvent({ primaryKeyValues: KEY_JSON });
        await expect(ResolveEntityEventRow(evt, providerReturning(null, read))).resolves.toBeNull();
    });

    it('falls back to the re-read when recordData is malformed', async () => {
        const evt = remoteEvent({ primaryKeyValues: KEY_JSON, recordData: '{not json' });
        const row = await ResolveEntityEventRow(evt, providerReturning({ ID: 'abc-123' }));
        expect(row).toEqual({ ID: 'abc-123' });
    });

    it('returns null with no key to read by', async () => {
        await expect(ResolveEntityEventRow(remoteEvent({}), providerReturning({ ID: 'x' }))).resolves.toBeNull();
    });

    it('uses the provider carried on the event when none is passed', async () => {
        const read = vi.fn(async () => ({ IsSaved: true, GetAll: () => ({ ID: 'abc-123' }) }));
        const evt = remoteEvent({ primaryKeyValues: KEY_JSON });
        (evt as unknown as { provider: IMetadataProvider }).provider = providerReturning(null, read);
        await expect(ResolveEntityEventRow(evt)).resolves.toEqual({ ID: 'abc-123' });
    });
});

describe('ResolveEntityEventKey', () => {
    it('reads identity from the key even when the row was withheld', () => {
        const key = ResolveEntityEventKey(remoteEvent({ primaryKeyValues: KEY_JSON }));
        expect(key?.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: 'abc-123' }]);
    });

    it('survives a composite key rather than assuming a single ID column', () => {
        const composite = JSON.stringify([{ FieldName: 'OrderID', Value: 'o1' }, { FieldName: 'LineNo', Value: 2 }]);
        const key = ResolveEntityEventKey(remoteEvent({ primaryKeyValues: composite }));
        expect(key?.KeyValuePairs.map(k => k.FieldName)).toEqual(['OrderID', 'LineNo']);
    });

    it('returns null when the event carries no key', () => {
        expect(ResolveEntityEventKey(remoteEvent({}))).toBeNull();
    });
});
