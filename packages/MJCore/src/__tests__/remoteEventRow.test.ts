/**
 * `ResolveEntityEventRow` / `ResolveEntityEventKey` — the row behind a remote-invalidate event.
 *
 * These exist because cache-invalidation events reach every client on one unfiltered
 * subscription, so the server withholds the row unless a deployment allowlisted the entity. The
 * contract that matters: a consumer still gets its row, through a read the server access-controls,
 * and gets `null` — not someone else's data, and not an exception — when it may not have it.
 */
import { describe, it, expect, vi, type Mock } from 'vitest';
import { ResolveEntityEventRow, ResolveEntityEventKey, EntityEventRowIsFree, type EntityEventRowProvider } from '../generic/remoteEventRow';
import { CompositeKey } from '../generic/compositeKey';
import type { BaseEntityEvent } from '../generic/baseEntity';
import type { RunViewResult } from '../generic/interfaces';
import type { RunViewParams } from '../views/runView';
import type { UserInfo } from '../generic/securityInfo';

const KEY_JSON = JSON.stringify([{ FieldName: 'ID', Value: 'abc-123' }]);

function remoteEvent(payload: Record<string, unknown>, entityName = 'MJ: Conversation Details'): BaseEntityEvent {
    return { type: 'remote-invalidate', baseEntity: null, entityName, payload } as unknown as BaseEntityEvent;
}

/** An entity object double: `LoadFromData` keeps the row, `GetAll` hands it back. */
class EntityRowDouble {
    /** A keyed load that found its record reports it saved. */
    public readonly IsSaved = true;
    private data: Record<string, unknown> = {};

    public static Holding(data: Record<string, unknown>): EntityRowDouble {
        const entity = new EntityRowDouble();
        entity.data = data;
        return entity;
    }

    public async LoadFromData(data: Record<string, unknown>): Promise<boolean> {
        this.data = data;
        return true;
    }

    public GetAll(): Record<string, unknown> {
        return this.data;
    }
}

type RunViewFn = (params: RunViewParams, contextUser?: UserInfo) => Promise<RunViewResult<Record<string, unknown>>>;
type GetEntityObjectFn = (entityName: string, contextUser?: UserInfo) => Promise<EntityRowDouble>;

/** A provider double: `RunView` (absent when null) and an entity factory handing out blank entity doubles. */
class ProviderDouble implements EntityEventRowProvider {
    public readonly RunView?: Mock<RunViewFn>;
    public readonly GetEntityObject: Mock<GetEntityObjectFn>;

    constructor(runView: Mock<RunViewFn> | null, getEntityObject?: Mock<GetEntityObjectFn>) {
        if (runView) {
            this.RunView = runView;
        }
        this.GetEntityObject = getEntityObject ?? vi.fn<GetEntityObjectFn>(async () => new EntityRowDouble());
    }
}

function viewResult(rows: Array<Record<string, unknown>>, success = true): RunViewResult<Record<string, unknown>> {
    return { Success: success, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: success ? '' : 'denied', UserViewRunID: '' };
}

/** A view double; `rows` is what the keyed view returns. */
function runViewReturning(rows: Array<Record<string, unknown>>, success = true): Mock<RunViewFn> {
    return vi.fn<RunViewFn>(async () => viewResult(rows, success));
}

/** A provider whose keyed view returns `row` (none when null — a refused or deleted record); `spy` replaces RunView. */
function providerReturning(row: Record<string, unknown> | null, spy?: Mock<RunViewFn>): ProviderDouble {
    return new ProviderDouble(spy ?? runViewReturning(row ? [row] : []));
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
        const read = runViewReturning([{ ID: 'abc-123' }]);
        await ResolveEntityEventRow(remoteEvent({ primaryKeyValues: KEY_JSON }), providerReturning(null, read));
        const [params] = read.mock.calls[0];
        expect(params.EntityName).toBe('MJ: Conversation Details');
        expect(params.ExtraFilter).toBe(CompositeKey.FromKeyValuePairs([{ FieldName: 'ID', Value: 'abc-123' }]).ToWhereClause());
        expect(params.ResultType).toBe('simple');
    });

    // The security property, and it has to be asserted against a read that WOULD hand over
    // fields: a refused view can still carry rows in a failed result, so gating on anything other
    // than `Success` would pass this row on.
    it('returns null when the read is refused, even though the result would yield fields', async () => {
        const refused = providerReturning(null, runViewReturning([{ ID: 'abc-123', Secret: 'must-not-escape' }], false));
        const evt = remoteEvent({ primaryKeyValues: KEY_JSON });
        await expect(ResolveEntityEventRow(evt, refused)).resolves.toBeNull();
    });

    // The handler runs detached from whatever else is using the provider. A transaction
    // another unit of work has open on that provider is not this read's: the read must run on the
    // pool and see committed data, never join the transaction and see its uncommitted row.
    it('reads on the pool: a re-read during another unit\'s open transaction does not join it', async () => {
        const committed = { ID: 'abc-123', ConversationID: 'committed-conv' };
        const uncommitted = { ID: 'abc-123', ConversationID: 'uncommitted-conv' };
        const sharedProvider = new ProviderDouble(
            // a database provider reads on the pool only when asked to; otherwise on the open transaction
            vi.fn<RunViewFn>(async (params) => viewResult([params.ReadOnPool === true ? committed : uncommitted])),
            // a keyed load (a key where the user goes) has no pool option: it always runs on the open transaction
            vi.fn<GetEntityObjectFn>(async (_name, userOrKey) =>
                userOrKey instanceof CompositeKey ? EntityRowDouble.Holding(uncommitted) : new EntityRowDouble()),
        );
        const row = await ResolveEntityEventRow(remoteEvent({ primaryKeyValues: KEY_JSON }), sharedProvider);
        expect(row).toEqual(committed);
    });

    it('returns null when the provider cannot run views', async () => {
        const noViews = new ProviderDouble(null);
        await expect(ResolveEntityEventRow(remoteEvent({ primaryKeyValues: KEY_JSON }), noViews)).resolves.toBeNull();
    });

    it('returns null when the read throws', async () => {
        const read = vi.fn<RunViewFn>(async () => { throw new Error('denied'); });
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
        const read = runViewReturning([{ ID: 'abc-123' }]);
        const evt = remoteEvent({ primaryKeyValues: KEY_JSON });
        // every MJ provider carries more than the double; the read needs only what EntityEventRowProvider names
        Object.assign(evt, { provider: providerReturning(null, read) });
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

/**
 * The question a consumer must ask BEFORE deciding to skip hydration: does this row cost anything?
 * "Would I use the row" and "does obtaining it cost a read" are different questions, and only the
 * second justifies skipping — conflating them is how a save handler ends up reading every field
 * as `undefined` and acting on it.
 */
describe('EntityEventRowIsFree', () => {
    it('is true for a local event — the row IS the live entity', () => {
        expect(EntityEventRowIsFree({ baseEntity: { GetAll: () => ({}) } } as unknown as BaseEntityEvent)).toBe(true);
    });

    it('is true when the server sent recordData, because the entity is allowlisted', () => {
        expect(EntityEventRowIsFree(remoteEvent({ primaryKeyValues: KEY_JSON, recordData: '{"ID":"abc-123"}' }))).toBe(true);
    });

    it('is false when the row was withheld — obtaining it would cost a keyed read', () => {
        expect(EntityEventRowIsFree(remoteEvent({ primaryKeyValues: KEY_JSON }))).toBe(false);
    });

    it('is false for an explicit null recordData, not merely an absent one', () => {
        expect(EntityEventRowIsFree(remoteEvent({ primaryKeyValues: KEY_JSON, recordData: null }))).toBe(false);
    });

    it('agrees with ResolveEntityEventRow: free means resolvable with no provider at all', async () => {
        const free = remoteEvent({ primaryKeyValues: KEY_JSON, recordData: '{"ID":"abc-123"}' });
        expect(EntityEventRowIsFree(free)).toBe(true);
        await expect(ResolveEntityEventRow(free)).resolves.toEqual({ ID: 'abc-123' });
    });
});
