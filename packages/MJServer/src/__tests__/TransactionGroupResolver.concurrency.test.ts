/**
 * Concurrency checking for updates sent through `ExecuteTransactionGroup`.
 *
 * An update item that carries the client's `OldValues` is handled like a single-record update:
 * the old values are compared with the row the server just loaded (a stale client is refused
 * before anything is queued), and the save is queued with `ConcurrencyCheck: 'enforce'` plus the
 * client's baseline, so the provider repeats the comparison under a row lock when the group
 * submits. These tests drive the resolver's item handling against a real `BaseEntity`.
 */
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { BaseEntity, BaseEntityResult, EntityInfo, EntitySaveOptions, UserInfo } from '@memberjunction/core';
import {
    TransactionResolver,
    TransactionItemInputType,
    TransactionOperationType,
} from '../resolvers/TransactionGroupResolver.js';
import type { AppContext } from '../types.js';

const ENTITY_ID = 'E0000000-0000-0000-0000-0000000000C1';

function widgetEntityInfo(): EntityInfo {
    const base = { EntityID: ENTITY_ID, Status: 'Active', AllowsNull: true, IsPrimaryKey: false, AllowUpdateAPI: true };
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Widgets',
        Status: 'Active',
        SchemaName: 'dbo',
        BaseTable: 'Widget',
        BaseTableCodeName: 'Widget',
        BaseView: 'vwWidgets',
        AllowUpdateAPI: true,
        TrackRecordChanges: false,
        EntityFields: [
            { ...base, ID: 'F-C1', Sequence: 1, Name: 'ID', Type: 'uniqueidentifier', Length: 16, AllowsNull: false, IsPrimaryKey: true, IsUnique: true, AllowUpdateAPI: false },
            { ...base, ID: 'F-C2', Sequence: 2, Name: 'Name', Type: 'nvarchar', Length: 200 },
            { ...base, ID: 'F-C3', Sequence: 3, Name: 'Notes', Type: 'nvarchar', Length: 200 },
        ],
        EntityPermissions: [],
    });
}

class WidgetEntity extends BaseEntity {}

/** A widget as `InnerLoad` leaves it: the stored row, with nothing dirty. */
async function storedWidget(stored: Record<string, unknown>): Promise<BaseEntity> {
    const entity = new WidgetEntity(widgetEntityInfo());
    await entity.LoadFromData(stored, true);
    return entity;
}

const USER = { ID: 'u-1', Name: 'Tester', Email: 'tester@example.com' } as object as UserInfo;

/** Exposes the item handling and records the error logs it would write. */
class InspectableResolver extends TransactionResolver {
    public readonly ErrorLogs: Array<Record<string, unknown>> = [];

    public Apply(item: TransactionItemInputType, entity: BaseEntity, values: Record<string, unknown>): Promise<EntitySaveOptions | null> {
        return this.ApplyItemValues(item, entity, values, USER);
    }
    public LogConflicts(entities: BaseEntity[]): Promise<void> {
        return this.LogConcurrencyConflicts(entities, USER);
    }
    protected override async persistSaveInconsistencyErrorLog(
        _entity: BaseEntity,
        _user: UserInfo | undefined,
        payload: Record<string, unknown>,
    ): Promise<void> {
        this.ErrorLogs.push(payload);
    }
}

function updateItem(oldValues?: Array<{ Key: string; Value: string | null }>): TransactionItemInputType {
    const item = new TransactionItemInputType();
    item.EntityName = 'Widgets';
    item.EntityObjectJSON = '{}';
    item.OperationType = TransactionOperationType.Update;
    item.OldValues = oldValues ?? null;
    return item;
}

describe('TransactionResolver concurrency checking for update items', () => {
    it('applies the values and saves with default options when the item carries no OldValues', async () => {
        const resolver = new InspectableResolver();
        const entity = await storedWidget({ ID: 'w-1', Name: 'Stored', Notes: null });

        const options = await resolver.Apply(updateItem(), entity, { ID: 'w-1', Name: 'Client New' });

        expect(options).not.toBeNull();
        expect(options?.ConcurrencyCheck).toBeUndefined();
        expect(options?.ConcurrencyBaseline).toBeUndefined();
        expect(entity.Get('Name')).toBe('Client New');
    });

    it("queues an enforced check with the client's baseline when its old values match the stored row", async () => {
        const resolver = new InspectableResolver();
        const entity = await storedWidget({ ID: 'w-1', Name: 'Stored', Notes: null });

        const options = await resolver.Apply(
            updateItem([{ Key: 'ID', Value: 'w-1' }, { Key: 'Name', Value: 'Stored' }]),
            entity,
            { ID: 'w-1', Name: 'Client New' },
        );

        expect(options?.ConcurrencyCheck).toBe('enforce');
        expect(options?.ConcurrencyBaseline).toEqual({ Name: 'Stored' });
        expect(entity.Get('Name')).toBe('Client New');
        expect(resolver.ErrorLogs).toEqual([]);
    });

    it('refuses the item, recording the conflict, when another writer changed the field the client changed', async () => {
        const resolver = new InspectableResolver();
        const entity = await storedWidget({ ID: 'w-1', Name: 'Changed By Someone Else', Notes: null });

        const options = await resolver.Apply(
            updateItem([{ Key: 'ID', Value: 'w-1' }, { Key: 'Name', Value: 'Stored' }]),
            entity,
            { ID: 'w-1', Name: 'Client New' },
        );

        expect(options).toBeNull();
        expect(entity.LatestResult?.Success).toBe(false);
        expect(entity.LatestResult?.ConcurrencyConflict).toEqual({ ConflictingFields: ['Name'] });
        expect(entity.LatestResult?.Message).toContain('Concurrent modification conflict on Widgets');
        expect(entity.Get('Name')).toBe('Changed By Someone Else');
        expect(resolver.ErrorLogs).toHaveLength(1);
    });

    it('keeps a concurrent change to a field the client did not touch', async () => {
        const resolver = new InspectableResolver();
        const entity = await storedWidget({ ID: 'w-1', Name: 'Stored', Notes: 'Added By Someone Else' });

        const options = await resolver.Apply(
            updateItem([{ Key: 'ID', Value: 'w-1' }, { Key: 'Name', Value: 'Stored' }]),
            entity,
            { ID: 'w-1', Name: 'Client New' },
        );

        expect(options?.ConcurrencyCheck).toBe('enforce');
        expect(entity.Get('Name')).toBe('Client New');
        expect(entity.Get('Notes')).toBe('Added By Someone Else');
    });

    it('ignores payload keys that name no field, as the group path always has', async () => {
        const resolver = new InspectableResolver();
        const entity = await storedWidget({ ID: 'w-1', Name: 'Stored', Notes: null });

        const options = await resolver.Apply(
            updateItem([{ Key: 'ID', Value: 'w-1' }, { Key: 'Name', Value: 'Stored' }]),
            entity,
            { ID: 'w-1', Name: 'Client New', NotAField: 'ignored' },
        );

        expect(options?.ConcurrencyCheck).toBe('enforce');
        expect(entity.Get('Name')).toBe('Client New');
    });

    it('writes a SAVE_INCONSISTENCY error log for each item the provider rejected at submit', async () => {
        const resolver = new InspectableResolver();
        const conflicted = await storedWidget({ ID: 'w-1', Name: 'Stored', Notes: null });
        const conflict = new BaseEntityResult();
        conflict.Success = false;
        conflict.Type = 'update';
        conflict.Message = 'Concurrent modification conflict on Widgets for field(s): Name.';
        conflict.ConcurrencyConflict = { ConflictingFields: ['Name'] };
        conflicted.RegisterResultHistoryEntry(conflict);
        const bystander = await storedWidget({ ID: 'w-2', Name: 'Other', Notes: null });

        await resolver.LogConflicts([conflicted, bystander]);

        expect(resolver.ErrorLogs).toEqual([
            {
                Message: 'Concurrent modification conflict on Widgets for field(s): Name.',
                ConflictingFields: ['Name'],
            },
        ]);
    });
});

/** Stands in for the provider's group: counts what enrols and whether it was submitted. */
class FakeGroup {
    public Enrolled = 0;
    public Submitted = false;
    public AddTransaction(): void { this.Enrolled++; }
    public AddVariable(): void { /* no variables here */ }
    public async Submit(): Promise<boolean> { this.Submitted = true; return true; }
}

/** A widget whose load returns `stored` and whose save records the options it was given. */
class RecordingWidget extends WidgetEntity {
    public SavedWith: EntitySaveOptions | undefined;
    constructor(private readonly stored: Record<string, unknown>, private readonly group: FakeGroup) {
        super(widgetEntityInfo());
    }
    public override async InnerLoad(): Promise<boolean> {
        await this.LoadFromData(this.stored, true);
        return true;
    }
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        this.SavedWith = options;
        this.group.AddTransaction();
        return true;
    }
}

function contextFor(entity: RecordingWidget, group: FakeGroup): AppContext {
    const provider = {
        CreateTransactionGroup: async () => group,
        GetEntityObject: async () => entity,
        Entities: [] as EntityInfo[],
        EntityByID: () => undefined,
    };
    return {
        providers: [{ type: 'Read-Write', provider }],
        userPayload: { userRecord: USER, email: USER.Email },
    } as unknown as AppContext;
}

describe('ExecuteTransactionGroup with client OldValues', () => {
    function updateGroup(oldName: string) {
        return {
            Items: [{
                EntityName: 'Widgets',
                EntityObjectJSON: JSON.stringify({ ID: 'w-1', Name: 'Client New' }),
                OperationType: TransactionOperationType.Update,
                OldValues: [{ Key: 'ID', Value: 'w-1' }, { Key: 'Name', Value: oldName }],
            }],
            Variables: [],
        };
    }

    it("queues the update with 'enforce' and the client's baseline, then submits", async () => {
        const group = new FakeGroup();
        const entity = new RecordingWidget({ ID: 'w-1', Name: 'Stored', Notes: null }, group);

        const result = await new InspectableResolver().ExecuteTransactionGroup(updateGroup('Stored'), contextFor(entity, group));

        expect(result.Success).toBe(true);
        expect(entity.SavedWith?.ConcurrencyCheck).toBe('enforce');
        expect(entity.SavedWith?.ConcurrencyBaseline).toEqual({ Name: 'Stored' });
        expect(group.Submitted).toBe(true);
    });

    it('refuses a stale update without saving or submitting the group', async () => {
        const group = new FakeGroup();
        const entity = new RecordingWidget({ ID: 'w-1', Name: 'Changed By Someone Else', Notes: null }, group);
        const resolver = new InspectableResolver();

        const result = await resolver.ExecuteTransactionGroup(updateGroup('Stored'), contextFor(entity, group));

        expect(result.Success).toBe(false);
        expect(entity.SavedWith).toBeUndefined();
        expect(group.Submitted).toBe(false);
        expect(JSON.parse(result.ErrorMessages[0]).ConcurrencyConflict).toEqual({ ConflictingFields: ['Name'] });
        expect(resolver.ErrorLogs).toHaveLength(1);
    });
});
